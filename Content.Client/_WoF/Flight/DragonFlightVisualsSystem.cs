using System.Numerics;
using Content.Shared._WoF.Flight;
using Robust.Client.GameObjects;
using DrawDepth = Content.Shared.DrawDepth.DrawDepth;

namespace Content.Client._WoF.Flight;

/// <summary>
///     Lifts a flying dragon's sprite according to its altitude so height reads at a glance, and draws
///     high flyers above walls and doors.
///     TODO: ground shadow that stays on the tile, banking, and wind particles (see the flight design doc).
/// </summary>
public sealed class DragonFlightVisualsSystem : EntitySystem
{
    [Dependency] private readonly SpriteSystem _sprite = default!;

    public override void Initialize()
    {
        base.Initialize();

        SubscribeLocalEvent<DragonFlightComponent, AfterAutoHandleStateEvent>(OnHandleState);
        // ComponentShutdown is already subscribed by the shared DragonFlightSystem, and the engine
        // allows only one subscription per component/event pair, so reset the sprite on removal instead.
        SubscribeLocalEvent<DragonFlightComponent, ComponentRemove>(OnRemove);
    }

    private void OnHandleState(Entity<DragonFlightComponent> ent, ref AfterAutoHandleStateEvent args)
    {
        if (!TryComp<SpriteComponent>(ent, out var sprite))
            return;

        var height = ent.Comp.Altitude switch
        {
            FlightAltitude.Low => ent.Comp.LowVisualOffset,
            FlightAltitude.High => ent.Comp.HighVisualOffset,
            _ => 0f,
        };

        _sprite.SetOffset((ent.Owner, sprite), new Vector2(0f, height));

        if (ent.Comp.Altitude == FlightAltitude.High)
        {
            ent.Comp.OriginalDrawDepth ??= sprite.DrawDepth;
            _sprite.SetDrawDepth((ent.Owner, sprite), (int) DrawDepth.Overdoors);
        }
        else if (ent.Comp.OriginalDrawDepth is { } original)
        {
            _sprite.SetDrawDepth((ent.Owner, sprite), original);
            ent.Comp.OriginalDrawDepth = null;
        }
    }

    private void OnRemove(Entity<DragonFlightComponent> ent, ref ComponentRemove args)
    {
        if (!TryComp<SpriteComponent>(ent, out var sprite))
            return;

        _sprite.SetOffset((ent.Owner, sprite), Vector2.Zero);
        if (ent.Comp.OriginalDrawDepth is { } original)
            _sprite.SetDrawDepth((ent.Owner, sprite), original);
    }
}
