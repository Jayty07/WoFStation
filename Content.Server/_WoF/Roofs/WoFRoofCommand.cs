using Content.Server.Administration;
using Content.Shared.Administration;
using Content.Shared.Light.Components;
using Content.Shared.Light.EntitySystems;
using Content.Shared.Maps;
using Content.Shared.Physics;
using Robust.Shared.Console;
using Robust.Shared.Map.Components;

namespace Content.Server._WoF.Roofs;

/// <summary>
///     Puts roofs on (or takes them off) tiles around the admin, so dragons can't descend into secure areas.
///     Mappers can also place RoofMarker entities in the map editor; this is the quick in-game version.
///     <code>
///     wofroof room [on|off]       roof the enclosed room you're standing in (stops at walls, windows and doors)
///     wofroof radius N [on|off]   roof a square of radius N around you
///     wofroof grid [on|off]       roof every floor tile on the grid you're on
///     </code>
/// </summary>
[AdminCommand(AdminFlags.Mapping)]
public sealed class WoFRoofCommand : IConsoleCommand
{
    [Dependency] private readonly IEntityManager _entManager = default!;

    private const int MaxRoomTiles = 4000;

    // Room boundaries: walls and windows (Impassable) and doors (HighImpassable).
    private const CollisionGroup RoomBoundary = CollisionGroup.Impassable | CollisionGroup.HighImpassable;

    public string Command => "wofroof";
    public string Description => Loc.GetString("cmd-wofroof-desc");
    public string Help => Loc.GetString("cmd-wofroof-help");

    public void Execute(IConsoleShell shell, string argStr, string[] args)
    {
        if (shell.Player?.AttachedEntity is not { } player)
        {
            shell.WriteError(Loc.GetString("cmd-wofroof-no-entity"));
            return;
        }

        var xform = _entManager.GetComponent<TransformComponent>(player);
        if (xform.GridUid is not { } gridUid || !_entManager.TryGetComponent<MapGridComponent>(gridUid, out var grid))
        {
            shell.WriteError(Loc.GetString("cmd-wofroof-no-grid"));
            return;
        }

        if (args.Length < 1)
        {
            shell.WriteLine(Help);
            return;
        }

        var map = _entManager.System<SharedMapSystem>();
        var roofs = _entManager.System<SharedRoofSystem>();
        var turf = _entManager.System<TurfSystem>();
        _entManager.EnsureComponent<RoofComponent>(gridUid);

        var origin = map.TileIndicesFor(gridUid, grid, xform.Coordinates);
        HashSet<Vector2i> tiles;
        bool value;

        switch (args[0])
        {
            case "room":
                value = args.Length < 2 || args[1] != "off";
                tiles = FloodRoom(map, turf, gridUid, grid, origin, out var hitLimit);
                if (hitLimit)
                {
                    shell.WriteError(Loc.GetString("cmd-wofroof-room-too-big", ("max", MaxRoomTiles)));
                    return;
                }
                break;

            case "radius":
                if (args.Length < 2 || !int.TryParse(args[1], out var radius) || radius < 0 || radius > 50)
                {
                    shell.WriteError(Loc.GetString("cmd-wofroof-bad-radius"));
                    return;
                }

                value = args.Length < 3 || args[2] != "off";
                tiles = new HashSet<Vector2i>();
                for (var x = -radius; x <= radius; x++)
                {
                    for (var y = -radius; y <= radius; y++)
                    {
                        tiles.Add(origin + new Vector2i(x, y));
                    }
                }
                break;

            case "grid":
                value = args.Length < 2 || args[1] != "off";
                tiles = new HashSet<Vector2i>();
                foreach (var tile in map.GetAllTiles(gridUid, grid))
                {
                    tiles.Add(tile.GridIndices);
                }
                break;

            default:
                shell.WriteLine(Help);
                return;
        }

        foreach (var index in tiles)
        {
            roofs.SetRoof((gridUid, grid, null), index, value);
        }

        shell.WriteLine(Loc.GetString(value ? "cmd-wofroof-done-on" : "cmd-wofroof-done-off", ("count", tiles.Count)));
    }

    /// <summary>
    ///     Flood fill from the admin's tile through open floor. Boundary tiles (walls, windows, doors)
    ///     are included so doorways are roofed too.
    /// </summary>
    private HashSet<Vector2i> FloodRoom(SharedMapSystem map, TurfSystem turf, EntityUid gridUid, MapGridComponent grid,
        Vector2i origin, out bool hitLimit)
    {
        hitLimit = false;
        var result = new HashSet<Vector2i>();
        var queue = new Queue<Vector2i>();
        queue.Enqueue(origin);
        result.Add(origin);

        while (queue.TryDequeue(out var current))
        {
            if (result.Count > MaxRoomTiles)
            {
                hitLimit = true;
                return result;
            }

            // Boundary tiles get roofed but we don't spread past them.
            if (current != origin && turf.IsTileBlocked(gridUid, current, RoomBoundary, grid))
                continue;

            foreach (var dir in new[] { new Vector2i(1, 0), new Vector2i(-1, 0), new Vector2i(0, 1), new Vector2i(0, -1) })
            {
                var next = current + dir;
                if (result.Contains(next))
                    continue;

                // Stop at space / missing tiles: an open room isn't a room.
                if (!map.TryGetTileRef(gridUid, grid, next, out var tile) || tile.Tile.IsEmpty || tile.IsSpace())
                    continue;

                result.Add(next);
                queue.Enqueue(next);
            }
        }

        return result;
    }
}
