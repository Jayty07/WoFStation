# Wings of Fire: Kingdoms of Pyrrhia: vertical slice

Built on Einstein Engines (engine 267.3.0, .NET 9). New code lives in `_WoF` folders, and upstream edits are
marked `WoF` in a comment.

## What's in it

| Area | Files |
|---|---|
| Dragon flight | `Content.Shared/_WoF/Flight`, `Content.Client/_WoF/Flight` |
| Roof command | `Content.Server/_WoF/Roofs` |
| Antagonist objective code | `Content.Server/_WoF/Objectives` |
| Tribes, jobs, antagonists, map, barrier | `Resources/Prototypes/_WoF` |
| Text | `Resources/Locale/en-US/_WoF` |
| Upstream edits | `Content.Shared/Flight/Events.cs` and `SharedFlightSystem.cs` (raise `FlightToggledEvent`), `CollisionGroup.cs` (`FlightBarrier`), both `departments.yml` (`editorHidden`), `ConfigPresets/Build/development.toml` |

## Flight

| Altitude | How you get there | What it does |
|---|---|---|
| Ground | Land | Normal walking |
| Low | **Fly** | Over tables, crates, railings and half walls. Walls, windows and doors still block. You can still use things. |
| High | **Climb** from Low, outdoors only | Over walls, doors and buildings. 35% faster. You can't pick things up or use anything on the ground. Only flight barriers block you. Drawn above walls and doors. |

- **Roofs protect secure areas.**
  - You can't **Climb** from under a roof.
  - You can't **Descend** from High onto a roofed tile, or onto a wall, door or tall machine.
  - If you fall from High over a roof or wall (stunned, crit, wing lost, flight turned off), you tumble onto the nearest open ground within 8 tiles.
- **Falling.** Falling from High does 20 Blunt and from Low does 4. Losing or disabling the wing-arm grounds you.
- **Flight barriers.** `WoFFlightBarrier` is an invisible marker that only stops high flyers. Put it along map edges, around mountains and on tall towers.

### Roofs

Roofs use EE's existing roof system. Walls always count as roofed.

- **In the map editor:** place `RoofMarker` (Enabled) or `NoRoofMarker` (Disabled) entities.
- **In game (admin, Mapping permission):**
  - `wofroof room [on|off]`: roof the enclosed room you're standing in. It stops at walls, windows and doors, and roofs the doorways too.
  - `wofroof radius N [on|off]`: roof a square around you.
  - `wofroof grid [on|off]`: roof every floor tile on the grid.

On the test station, try `wofroof grid` and then `wofroof room off` in a hall or two so there's somewhere open to land. Or just roof the brig, vault and throne room with `wofroof room`.

## Jobs

All upstream departments are hidden from the character editor, so only kingdom jobs show up. The dev build now loads the kingdom test map (`WoFTestCourt`) and the Intrigue game mode instead of EE's Dev map.

## Antagonists: the Intrigue game mode (`WoFIntrigue`)

| Antagonist | How many | Objectives | Gear (placeholder) |
|---|---|---|---|
| Royal Usurper | 1 per 20 players, max 1, round start only | Kill the Queen, take her signet (placeholder: Captain's ID), survive | Kitchen knife |
| Infiltrating Assassin | 1 per 15 players, max 2, also latejoin | Kill 2 random targets, survive | Combat knife, toxin bottle, syringe, neck gaiter |
| Smuggler | 1 per 10 players, max 3, also latejoin | Steal 3 random valuables: royal seals (stamps), royal treasure (gold medal), healer's supplies (hypospray), officials' cloaks | Pickpocket gloves, crowbar |

- Players opt in from the antag list in the character editor.
- The Queen and the guard jobs can never be picked.
- **Still to come:** the Bandit Captain (needs ghost-role spawning and a gang) and the Rogue Animus (needs relic magic).

## Testing on your machine

```bash
cd ~/documents/WoF_Dragon_Station
git pull
dotnet build -c Debug

# The lobby is turned on here so antags get picked at round start
dotnet run --project Content.Server --no-build -- --cvar game.lobbyenabled=true
# second window:
dotnet run --project Content.Client --no-build
```

1. In the character editor, check that only kingdom jobs show. Turn on the Royal Usurper, Assassin and Smuggler preferences.
2. Ready up and start the round. Check that you got an antag briefing and your objectives (character menu, `C`).
3. **Low flight:** Fly over a table. Then try a wall, which should block you.
4. **Roofs:** go outside a room, run `wofroof room` inside the brig, then go back outside.
5. **High flight:** Fly, Climb, then fly over the brig. Descend should be refused there and work again on open floor.
6. **Falling:** turn Fly off while above a roofed room. You should crash next to the building, not inside it.

## Placeholders to replace

- Dragon sprites. Bodies are reptilian sprites with bat-wing markings.
- Job gear, icons and access names, which are borrowed from station jobs.
- The test map, which is Pebble station.
- Antag gear and steal targets, which are station items.
- Action icons.

## Not verified yet

- **Not compiled.** These changes were written without a .NET SDK. All 94 prototype references were checked against the full EE prototype set, and the C# was checked against EE and engine source.
- **Client prediction.** Altitude changes run on the server, so expect a small snap when you take off or climb under lag.
- **Seeing over walls.** A high flyer's view is still blocked by walls.
