using Content.Server.Objectives.Components;
using Content.Server.Objectives.Systems;
using Content.Server.Revolutionary.Components;
using Content.Shared.Mind;
using Content.Shared.Objectives.Components;
using Content.Shared.Roles.Jobs;
using Robust.Shared.Random;

namespace Content.Server._WoF.Objectives;

public sealed class WoFPickJobTargetSystem : EntitySystem
{
    [Dependency] private readonly IRobustRandom _random = default!;
    [Dependency] private readonly SharedJobSystem _jobs = default!;
    [Dependency] private readonly SharedMindSystem _mind = default!;
    [Dependency] private readonly TargetObjectiveSystem _target = default!;

    public override void Initialize()
    {
        base.Initialize();

        SubscribeLocalEvent<WoFPickJobTargetComponent, ObjectiveAssignedEvent>(OnAssigned);
    }

    private void OnAssigned(EntityUid uid, WoFPickJobTargetComponent comp, ref ObjectiveAssignedEvent args)
    {
        if (!TryComp<TargetObjectiveComponent>(uid, out var target))
        {
            args.Cancelled = true;
            return;
        }

        if (target.Target != null)
            return;

        var alive = _mind.GetAliveHumans(args.MindId);
        if (alive.Count == 0)
        {
            args.Cancelled = true;
            return;
        }

        var matching = new List<Entity<MindComponent>>();
        foreach (var mind in alive)
        {
            foreach (var job in comp.Jobs)
            {
                if (!_jobs.MindHasJobWithId(mind.Owner, job))
                    continue;

                matching.Add(mind);
                break;
            }
        }

        if (matching.Count == 0)
        {
            if (!comp.Fallback)
            {
                args.Cancelled = true;
                return;
            }

            foreach (var mind in alive)
            {
                if (mind.Comp.OwnedEntity is { } body && HasComp<CommandStaffComponent>(body))
                    matching.Add(mind);
            }

            if (matching.Count == 0)
                matching.AddRange(alive);
        }

        _target.SetTarget(uid, _random.Pick(matching), target);
    }
}
