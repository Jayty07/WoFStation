using Content.Shared.Actions;
using Content.Shared.Damage;
using Content.Shared.Flight;
using Content.Shared.Flight.Events;
using Content.Shared.Interaction.Events;
using Content.Shared.Item;
using Content.Shared.Light.Components;
using Content.Shared.Light.EntitySystems;
using Content.Shared.Maps;
using Content.Shared.Mobs;
using Content.Shared.Movement.Systems;
using Content.Shared.Physics;
using Content.Shared.Popups;
using Robust.Shared.Map;
using Robust.Shared.Map.Components;
using Robust.Shared.Network;
using Robust.Shared.Physics;
using Robust.Shared.Physics.Systems;

namespace Content.Shared._WoF.Flight;

/// <summary>
///     Altitude bands for dragon flight, layered over the existing <see cref="FlightComponent"/> toggle.
///     <list type="bullet">
///         <item>Ground: normal walking.</item>
///         <item>Low: flying. Passes over tables, crates and half walls; walls and doors still block.
///               Can still interact with things.</item>
///         <item>High: flies over walls, doors and buildings. Faster, but can't pick things up or use
///               anything on the ground. Only mapped flight barriers block it.</item>
///     </list>
///     Roofs keep secure areas secure: you can't climb to high altitude from under a roof, and you can't
///     descend from high altitude onto a roofed tile (or into a wall). Falling out of the sky over a roof
///     drops you on the nearest open ground instead.
///     State changes run on the server and are networked; the client only draws the height.
/// </summary>
public sealed class DragonFlightSystem : EntitySystem
{
    [Dependency] private readonly INetManager _net = default!;
    [Dependency] private readonly SharedActionsSystem _actions = default!;
    [Dependency] private readonly SharedFlightSystem _flight = default!;
    [Dependency] private readonly SharedMapSystem _map = default!;
    [Dependency] private readonly SharedPhysicsSystem _physics = default!;
    [Dependency] private readonly SharedPopupSystem _popup = default!;
    [Dependency] private readonly SharedRoofSystem _roof = default!;
    [Dependency] private readonly SharedTransformSystem _transform = default!;
    [Dependency] private readonly DamageableSystem _damageable = default!;
    [Dependency] private readonly MovementSpeedModifierSystem _movementSpeed = default!;
    [Dependency] private readonly TurfSystem _turf = default!;

    public override void Initialize()
    {
        base.Initialize();

        SubscribeLocalEvent<DragonFlightComponent, MapInitEvent>(OnMapInit);
        SubscribeLocalEvent<DragonFlightComponent, ComponentShutdown>(OnShutdown);
        SubscribeLocalEvent<DragonFlightComponent, FlightToggledEvent>(OnFlightToggled);
        SubscribeLocalEvent<DragonFlightComponent, DragonClimbActionEvent>(OnClimb);
        SubscribeLocalEvent<DragonFlightComponent, DragonDescendActionEvent>(OnDescend);
        SubscribeLocalEvent<DragonFlightComponent, RefreshMovementSpeedModifiersEvent>(OnRefreshMoveSpeed);
        SubscribeLocalEvent<DragonFlightComponent, PickupAttemptEvent>(OnPickupAttempt);
        SubscribeLocalEvent<DragonFlightComponent, InteractionAttemptEvent>(OnInteractionAttempt);
        SubscribeLocalEvent<DragonFlightComponent, MobStateChangedEvent>(OnMobStateChanged);
    }

    #region Lifecycle

    private void OnMapInit(Entity<DragonFlightComponent> ent, ref MapInitEvent args)
    {
        _actions.AddAction(ent, ref ent.Comp.ClimbActionEntity, ent.Comp.ClimbAction);
        _actions.AddAction(ent, ref ent.Comp.DescendActionEntity, ent.Comp.DescendAction);
        Dirty(ent);
    }

    private void OnShutdown(Entity<DragonFlightComponent> ent, ref ComponentShutdown args)
    {
        _actions.RemoveAction(ent.Comp.ClimbActionEntity);
        _actions.RemoveAction(ent.Comp.DescendActionEntity);

        // The wing was removed or disabled while airborne: restore collision and crash.
        if (_net.IsServer && ent.Comp.Altitude != FlightAltitude.Ground && !TerminatingOrDeleted(ent))
        {
            var from = ent.Comp.Altitude;
            UndoMaskChanges(ent);
            if (from == FlightAltitude.High)
                MoveToSafeGround(ent);
            ApplyFallDamage(ent, from);
        }
    }

    /// <summary>
    ///     Going critical or dying in the air drops you. (The base flight system only lands you on other
    ///     state changes, so a downed dragon would otherwise keep floating.)
    /// </summary>
    private void OnMobStateChanged(EntityUid uid, DragonFlightComponent comp, MobStateChangedEvent args)
    {
        if (!_net.IsServer || args.NewMobState is not (MobState.Critical or MobState.Dead))
            return;

        if (TryComp<FlightComponent>(uid, out var flight) && flight.On)
            _flight.ToggleActive(uid, false, flight);
    }

    #endregion

    #region Altitude changes

    private void OnFlightToggled(Entity<DragonFlightComponent> ent, ref FlightToggledEvent args)
    {
        if (args.Active)
        {
            SetAltitude(ent, FlightAltitude.Low);
            return;
        }

        // Flight ended without a controlled landing (Descend sets Ground first), so this is a fall.
        var from = ent.Comp.Altitude;
        if (from == FlightAltitude.High)
            MoveToSafeGround(ent);

        SetAltitude(ent, FlightAltitude.Ground);
        if (from != FlightAltitude.Ground)
            ApplyFallDamage(ent, from);
    }

    private void OnClimb(Entity<DragonFlightComponent> ent, ref DragonClimbActionEvent args)
    {
        if (args.Handled)
            return;

        args.Handled = true;

        if (!_net.IsServer)
            return;

        switch (ent.Comp.Altitude)
        {
            case FlightAltitude.Ground:
                _popup.PopupEntity(Loc.GetString("wof-flight-takeoff-first"), ent, ent);
                break;
            case FlightAltitude.Low:
                if (IsUnderRoof(ent))
                {
                    _popup.PopupEntity(Loc.GetString("wof-flight-roof-above"), ent, ent);
                    break;
                }

                SetAltitude(ent, FlightAltitude.High);
                _popup.PopupEntity(Loc.GetString("wof-flight-climb"), ent, ent);
                break;
            case FlightAltitude.High:
                _popup.PopupEntity(Loc.GetString("wof-flight-already-high"), ent, ent);
                break;
        }
    }

    private void OnDescend(Entity<DragonFlightComponent> ent, ref DragonDescendActionEvent args)
    {
        if (args.Handled)
            return;

        args.Handled = true;

        if (!_net.IsServer)
            return;

        switch (ent.Comp.Altitude)
        {
            case FlightAltitude.High:
                if (IsUnderRoof(ent))
                {
                    _popup.PopupEntity(Loc.GetString("wof-flight-roof-below"), ent, ent);
                    break;
                }

                if (!CanComeDownHere(ent))
                {
                    _popup.PopupEntity(Loc.GetString("wof-flight-no-room"), ent, ent);
                    break;
                }

                SetAltitude(ent, FlightAltitude.Low);
                _popup.PopupEntity(Loc.GetString("wof-flight-descend"), ent, ent);
                break;
            case FlightAltitude.Low:
                // Controlled landing: set Ground before turning flight off so it doesn't count as a fall.
                if (TryComp<FlightComponent>(ent, out var flight) && flight.On)
                {
                    SetAltitude(ent, FlightAltitude.Ground);
                    _flight.ToggleActive(ent, false, flight);
                    _popup.PopupEntity(Loc.GetString("wof-flight-land"), ent, ent);
                }
                break;
        }
    }

    /// <summary>
    ///     Moves a dragon to a new altitude, updating collision, speed and networked state.
    ///     Server only; clients receive the result through component state.
    /// </summary>
    public void SetAltitude(Entity<DragonFlightComponent> ent, FlightAltitude altitude)
    {
        if (!_net.IsServer)
            return;

        if (ent.Comp.Altitude == altitude)
            return;

        UndoMaskChanges(ent);
        switch (altitude)
        {
            case FlightAltitude.Low:
                ApplyMaskChanges(ent, ent.Comp.LowIgnoredMask, 0);
                break;
            case FlightAltitude.High:
                ApplyMaskChanges(ent, ent.Comp.HighIgnoredMask, ent.Comp.HighAddedMask);
                break;
        }

        ent.Comp.Altitude = altitude;
        Dirty(ent);
        _movementSpeed.RefreshMovementSpeedModifiers(ent);
    }

    #endregion

    #region Collision

    private void ApplyMaskChanges(Entity<DragonFlightComponent> ent, int ignore, int add)
    {
        if (!TryComp<FixturesComponent>(ent, out var fixtures))
            return;

        foreach (var (id, fixture) in fixtures.Fixtures)
        {
            var removed = fixture.CollisionMask & ignore;
            var added = add & ~fixture.CollisionMask;
            if (removed == 0 && added == 0)
                continue;

            if (removed != 0)
                ent.Comp.RemovedMaskBits[id] = removed;
            if (added != 0)
                ent.Comp.AddedMaskBits[id] = added;

            _physics.SetCollisionMask(ent, id, fixture, (fixture.CollisionMask & ~removed) | added, fixtures);
        }
    }

    private void UndoMaskChanges(Entity<DragonFlightComponent> ent)
    {
        if (TryComp<FixturesComponent>(ent, out var fixtures))
        {
            foreach (var (id, fixture) in fixtures.Fixtures)
            {
                ent.Comp.RemovedMaskBits.TryGetValue(id, out var removed);
                ent.Comp.AddedMaskBits.TryGetValue(id, out var added);
                if (removed == 0 && added == 0)
                    continue;

                _physics.SetCollisionMask(ent, id, fixture, (fixture.CollisionMask & ~added) | removed, fixtures);
            }
        }

        ent.Comp.RemovedMaskBits.Clear();
        ent.Comp.AddedMaskBits.Clear();
    }

    #endregion

    #region Roofs and landing spots

    /// <summary>
    ///     True if the tile the entity is over has a roof (a mapped roof, or a wall, which counts as roofed).
    /// </summary>
    public bool IsUnderRoof(EntityUid uid)
    {
        var xform = Transform(uid);
        if (xform.GridUid is not { } gridUid
            || !TryComp<MapGridComponent>(gridUid, out var grid)
            || !TryComp<RoofComponent>(gridUid, out var roof))
            return false;

        var index = _map.TileIndicesFor(gridUid, grid, xform.Coordinates);
        return _roof.IsRooved((gridUid, grid, roof), index);
    }

    private bool CanComeDownHere(Entity<DragonFlightComponent> ent)
    {
        var xform = Transform(ent);
        if (xform.GridUid is not { } gridUid || !TryComp<MapGridComponent>(gridUid, out var grid))
            return false;

        var index = _map.TileIndicesFor(gridUid, grid, xform.Coordinates);
        return IsOpenGround(ent.Comp, gridUid, grid, index);
    }

    /// <summary>
    ///     A tile a dragon can come down onto: real floor, no roof, nothing tall in the way.
    /// </summary>
    private bool IsOpenGround(DragonFlightComponent comp, EntityUid gridUid, MapGridComponent grid, Vector2i index)
    {
        if (!_map.TryGetTileRef(gridUid, grid, index, out var tile) || tile.Tile.IsEmpty || tile.IsSpace())
            return false;

        if (TryComp<RoofComponent>(gridUid, out var roof) && _roof.IsRooved((gridUid, grid, roof), index))
            return false;

        return !_turf.IsTileBlocked(gridUid, index, (CollisionGroup) comp.LandingBlockedLayers, grid);
    }

    /// <summary>
    ///     Falling out of the sky over a roof or wall: tumble off onto the nearest open ground.
    /// </summary>
    private void MoveToSafeGround(Entity<DragonFlightComponent> ent)
    {
        var xform = Transform(ent);
        if (xform.GridUid is not { } gridUid || !TryComp<MapGridComponent>(gridUid, out var grid))
            return;

        var origin = _map.TileIndicesFor(gridUid, grid, xform.Coordinates);
        if (IsOpenGround(ent.Comp, gridUid, grid, origin))
            return;

        for (var radius = 1; radius <= ent.Comp.FallSearchRadius; radius++)
        {
            for (var x = -radius; x <= radius; x++)
            {
                for (var y = -radius; y <= radius; y++)
                {
                    // Only the outer ring of this radius; inner rings were already checked.
                    if (Math.Abs(x) != radius && Math.Abs(y) != radius)
                        continue;

                    var index = origin + new Vector2i(x, y);
                    if (!IsOpenGround(ent.Comp, gridUid, grid, index))
                        continue;

                    _transform.SetCoordinates(ent, _map.GridTileToLocal(gridUid, grid, index));
                    _popup.PopupEntity(Loc.GetString("wof-flight-tumble-off-roof"), ent, ent, PopupType.MediumCaution);
                    return;
                }
            }
        }
    }

    private void ApplyFallDamage(Entity<DragonFlightComponent> ent, FlightAltitude from)
    {
        var damage = from == FlightAltitude.High ? ent.Comp.HighFallDamage : ent.Comp.LowFallDamage;
        if (damage == null)
            return;

        _damageable.TryChangeDamage(ent.Owner, damage);
        if (from == FlightAltitude.High)
            _popup.PopupEntity(Loc.GetString("wof-flight-fall"), ent, ent, PopupType.MediumCaution);
    }

    #endregion

    #region Effects of altitude

    private void OnRefreshMoveSpeed(Entity<DragonFlightComponent> ent, ref RefreshMovementSpeedModifiersEvent args)
    {
        if (ent.Comp.Altitude != FlightAltitude.High)
            return;

        args.ModifySpeed(ent.Comp.HighSpeedModifier, ent.Comp.HighSpeedModifier);
    }

    private void OnPickupAttempt(EntityUid uid, DragonFlightComponent comp, PickupAttemptEvent args)
    {
        if (comp.Altitude == FlightAltitude.High)
            args.Cancel();
    }

    private void OnInteractionAttempt(Entity<DragonFlightComponent> ent, ref InteractionAttemptEvent args)
    {
        if (ent.Comp.Altitude != FlightAltitude.High || args.Target is not { } target)
            return;

        // Things we are holding or carrying are fine; the ground below is out of reach.
        if (target == ent.Owner || _transform.IsParentOf(Transform(ent), target))
            return;

        args.Cancelled = true;
    }

    #endregion
}
