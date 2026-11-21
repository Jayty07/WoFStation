using Content.Shared.Actions;
using Content.Shared.Damage;
using Content.Shared.Physics;
using Robust.Shared.GameStates;
using Robust.Shared.Prototypes;
using Robust.Shared.Serialization;

namespace Content.Shared._WoF.Flight;

/// <summary>
///     Adds altitude bands on top of the existing <see cref="Content.Shared.Flight.FlightComponent"/>.
///     Taking off puts a dragon at <see cref="FlightAltitude.Low"/>; it can then climb to
///     <see cref="FlightAltitude.High"/> and descend again. Granted by the dragon wing body part,
///     so losing or disabling the wing removes it (and drops the dragon if it was airborne).
/// </summary>
[RegisterComponent, NetworkedComponent, AutoGenerateComponentState(true)]
public sealed partial class DragonFlightComponent : Component
{
    [DataField, AutoNetworkedField]
    public FlightAltitude Altitude = FlightAltitude.Ground;

    [DataField]
    public EntProtoId ClimbAction = "ActionDragonClimb";

    [DataField]
    public EntProtoId DescendAction = "ActionDragonDescend";

    [DataField, AutoNetworkedField]
    public EntityUid? ClimbActionEntity;

    [DataField, AutoNetworkedField]
    public EntityUid? DescendActionEntity;

    /// <summary>
    ///     Extra speed multiplier while at high altitude, applied on top of the flight speed modifier.
    /// </summary>
    [DataField, AutoNetworkedField]
    public float HighSpeedModifier = 1.35f;

    /// <summary>
    ///     How far the sprite is lifted at each altitude, in tiles. Purely visual.
    /// </summary>
    [DataField]
    public float LowVisualOffset = 0.15f;

    [DataField]
    public float HighVisualOffset = 0.4f;

    /// <summary>
    ///     Collision bits ignored at low altitude: tables, crates, railings and half walls.
    ///     Walls, doors and tall machines still block.
    /// </summary>
    [DataField]
    public int LowIgnoredMask = (int) (CollisionGroup.MidImpassable | CollisionGroup.LowImpassable);

    /// <summary>
    ///     Collision bits ignored at high altitude: everything on the ground, walls and doors included.
    ///     Secure areas are protected by roofs instead, which stop a dragon from descending into them.
    /// </summary>
    [DataField]
    public int HighIgnoredMask = (int) (CollisionGroup.Impassable | CollisionGroup.HighImpassable
                                        | CollisionGroup.MidImpassable | CollisionGroup.LowImpassable);

    /// <summary>
    ///     Collision bits added at high altitude, so mapped flight barriers (map edges, mountains,
    ///     tall towers) still stop high flyers.
    /// </summary>
    [DataField]
    public int HighAddedMask = (int) CollisionGroup.FlightBarrier;

    /// <summary>
    ///     Layers that make a tile unsafe to come down onto from high altitude (walls, doors, tall machines).
    /// </summary>
    [DataField]
    public int LandingBlockedLayers = (int) (CollisionGroup.Impassable | CollisionGroup.HighImpassable);

    /// <summary>
    ///     How far, in tiles, to look for open ground when a dragon falls out of the sky
    ///     over a roof or wall.
    /// </summary>
    [DataField]
    public int FallSearchRadius = 8;

    /// <summary>
    ///     Damage taken when the dragon drops out of the sky from high altitude without descending first
    ///     (stunned, knocked out, wing lost, flight toggled off).
    /// </summary>
    [DataField]
    public DamageSpecifier? HighFallDamage;

    /// <summary>
    ///     Damage taken when dropping from low altitude. Usually small or none.
    /// </summary>
    [DataField]
    public DamageSpecifier? LowFallDamage;

    /// <summary>
    ///     Mask bits this system removed or added, per fixture, so changing altitude only undoes our own
    ///     changes and doesn't fight other systems (e.g. climbing) that also edit collision masks.
    /// </summary>
    [DataField]
    public Dictionary<string, int> RemovedMaskBits = new();

    [DataField]
    public Dictionary<string, int> AddedMaskBits = new();

    /// <summary>
    ///     Client-only: the sprite's draw depth before it was raised for high altitude.
    /// </summary>
    [ViewVariables]
    public int? OriginalDrawDepth;
}

[Serializable, NetSerializable]
public enum FlightAltitude : byte
{
    Ground,
    Low,
    High,
}

public sealed partial class DragonClimbActionEvent : InstantActionEvent { }

public sealed partial class DragonDescendActionEvent : InstantActionEvent { }
