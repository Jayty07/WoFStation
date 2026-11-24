#nullable enable
using System.Collections.Generic;
using System.Linq;
using Content.Shared._WoF.Flight;
using Content.Shared.Humanoid;
using Robust.Client.GameObjects;
using Robust.Shared.GameObjects;
using Robust.Shared.Maths;

namespace Content.IntegrationTests.Tests._WoF;

/// <summary>
///     Checks that a flying SkyWing is drawn with its flight sprites and goes back to its ground sprites afterwards.
/// </summary>
[TestFixture]
public sealed class DragonFlightPoseTest
{
    private static readonly string[] GroundAndFlightStates =
    {
        "wings_bone", "wings_membrane", "tail", "tail_underside", "front_near", "front_far", "hind_near", "hind_far",
    };

    [Test]
    public async Task SkyWingFlightSpritesTest()
    {
        await using var pair = await PoolManager.GetServerClient(new PoolSettings { Connected = true });
        var (server, client) = (pair.Server, pair.Client);
        var map = await pair.CreateTestMap();

        EntityUid dragon = default;
        await server.WaitAssertion(() =>
        {
            dragon = server.EntMan.Spawn("WoFMobSkyWing", map.MapCoords);
            Assert.That(server.EntMan.HasComponent<DragonFlightComponent>(dragon), "SkyWings should spawn able to fly");
        });
        await pair.RunTicksSync(10);
        var cDragon = pair.ToClientUid(dragon);

        // Which RSI each of the dragon's layers is using, by state name.
        async Task<Dictionary<string, string>> Layers()
        {
            var result = new Dictionary<string, string>();
            await client.WaitPost(() =>
            {
                var sys = client.System<SpriteSystem>();
                var sprite = client.EntMan.GetComponent<SpriteComponent>(cDragon);
                for (var i = 0; i < sprite.AllLayers.Count(); i++)
                {
                    if (sys.LayerGetRsiState((cDragon, sprite), i).Name is { } state
                        && GroundAndFlightStates.Contains(state)
                        && sys.LayerGetEffectiveRsi((cDragon, sprite), i) is { } rsi)
                        result[state] = rsi.Path.FilenameWithoutExtension;
                }
            });
            return result;
        }

        async Task AssertPose(bool flying, string when)
        {
            await pair.RunTicksSync(10);
            var layers = await Layers();
            Assert.Multiple(() =>
            {
                Assert.That(layers.Keys, Is.SupersetOf(GroundAndFlightStates), $"layers missing {when}");
                foreach (var (state, rsi) in layers)
                {
                    Assert.That(rsi.EndsWith("_fly"), Is.EqualTo(flying), $"{state} uses {rsi}.rsi {when}");
                }
            });
        }

        async Task SetAltitude(FlightAltitude altitude)
        {
            await server.WaitPost(() => server.System<DragonFlightSystem>()
                .SetAltitude((dragon, server.EntMan.GetComponent<DragonFlightComponent>(dragon)), altitude));
        }

        await AssertPose(false, "on the ground");

        await SetAltitude(FlightAltitude.Low);
        await AssertPose(true, "after taking off");

        await SetAltitude(FlightAltitude.High);
        await AssertPose(true, "at high altitude");

        // Refreshing a dragon's appearance resets its layers; it must not drop out of the pose.
        await server.WaitPost(() => server.System<SharedHumanoidAppearanceSystem>().SetSkinColor(dragon, Color.Orange));
        await AssertPose(true, "after an appearance refresh in the air");

        await SetAltitude(FlightAltitude.Ground);
        await AssertPose(false, "after landing");

        // Losing the wing in the air removes the component.
        await SetAltitude(FlightAltitude.Low);
        await AssertPose(true, "after taking off again");
        await server.WaitPost(() => server.EntMan.RemoveComponent<DragonFlightComponent>(dragon));
        await AssertPose(false, "after losing the ability to fly in the air");

        await pair.CleanReturnAsync();
    }
}
