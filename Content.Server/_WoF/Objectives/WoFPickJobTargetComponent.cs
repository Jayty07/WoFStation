using Content.Shared.Roles;
using Robust.Shared.Prototypes;

namespace Content.Server._WoF.Objectives;

/// <summary>
///     Sets the target of a <see cref="Content.Server.Objectives.Components.TargetObjectiveComponent"/> to a living
///     player holding one of the listed jobs, e.g. the Queen for the Royal Usurper.
///     Falls back to any department head (CommandStaff), then anyone, if nobody has those jobs this round.
/// </summary>
[RegisterComponent, Access(typeof(WoFPickJobTargetSystem))]
public sealed partial class WoFPickJobTargetComponent : Component
{
    [DataField(required: true)]
    public List<ProtoId<JobPrototype>> Jobs = new();

    /// <summary>
    ///     Whether to fall back to other targets when nobody holds the listed jobs.
    ///     If false, the objective is not given.
    /// </summary>
    [DataField]
    public bool Fallback = true;
}
