using System.Linq;
using Content.Shared._WoF.Flight;
using Robust.Client.GameObjects;
using Robust.Client.Graphics;
using Robust.Client.ResourceManagement;
using Robust.Shared.Utility;

namespace Content.Client._WoF.Flight;

/// <summary>
///     Puts airborne dragons in a flying pose. Every sprite layer whose RSI has a "_fly" sibling containing the
///     layer's current state ("parts.rsi" and "parts_fly.rsi") is switched to the sibling (beating wings, tucked
///     legs, trailing tail) and switched back on landing. Flight RSIs can be bigger than the ground ones, so spread
///     wings have room. Layers without flight art are left alone, so tribes that have none simply don't change.
/// </summary>
/// <remarks>
///     Checked every frame rather than on altitude changes, because the humanoid appearance system resets layers
///     to their ground sprites whenever a dragon's appearance is refreshed. Dragons that lose the flight component
///     in the air (a severed wing) are caught the same way.
/// </remarks>
public sealed class DragonFlightPoseSystem : EntitySystem
{
    [Dependency] private readonly IResourceCache _resources = default!;
    [Dependency] private readonly SpriteSystem _sprite = default!;

    private const string FlySuffix = "_fly";
    private const string Extension = ".rsi";

    /// <summary>
    ///     Dragons currently in the flying pose, so landed ones can be switched back.
    /// </summary>
    private readonly HashSet<EntityUid> _posed = new();

    private readonly List<EntityUid> _landed = new();

    /// <summary>
    ///     Ground RSI path to flight RSI path and the reverse, to avoid building paths every frame.
    /// </summary>
    private readonly Dictionary<ResPath, ResPath> _counterparts = new();

    public override void FrameUpdate(float frameTime)
    {
        base.FrameUpdate(frameTime);

        var query = EntityQueryEnumerator<DragonFlightComponent, SpriteComponent>();
        while (query.MoveNext(out var uid, out var flight, out var sprite))
        {
            if (flight.Altitude == FlightAltitude.Ground)
                continue;

            SetPose((uid, sprite), true);
            _posed.Add(uid);
        }

        if (_posed.Count == 0)
            return;

        foreach (var uid in _posed)
        {
            if (!TryComp<DragonFlightComponent>(uid, out var flight) || flight.Altitude == FlightAltitude.Ground)
                _landed.Add(uid);
        }

        foreach (var uid in _landed)
        {
            _posed.Remove(uid);
            if (TryComp<SpriteComponent>(uid, out var sprite))
                SetPose((uid, sprite), false);
        }

        _landed.Clear();
    }

    private void SetPose(Entity<SpriteComponent> ent, bool flying)
    {
        var count = ent.Comp.AllLayers.Count();
        for (var i = 0; i < count; i++)
        {
            if (_sprite.LayerGetEffectiveRsi(ent.AsNullable(), i) is not { } rsi || IsFlightRsi(rsi.Path) == flying)
                continue;

            var state = _sprite.LayerGetRsiState(ent.AsNullable(), i);
            if (state.IsValid
                && _resources.TryGetResource<RSIResource>(GetCounterpart(rsi.Path), out var other)
                && other.RSI.TryGetState(state, out _))
                _sprite.LayerSetRsi(ent.AsNullable(), i, other.RSI, state);
        }
    }

    private static bool IsFlightRsi(ResPath path)
    {
        return path.FilenameWithoutExtension.EndsWith(FlySuffix);
    }

    private ResPath GetCounterpart(ResPath path)
    {
        if (_counterparts.TryGetValue(path, out var counterpart))
            return counterpart;

        var name = path.FilenameWithoutExtension;
        name = IsFlightRsi(path) ? name[..^FlySuffix.Length] : name + FlySuffix;
        return _counterparts[path] = path.Directory / (name + Extension);
    }
}
