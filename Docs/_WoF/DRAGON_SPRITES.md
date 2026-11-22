# Dragon sprite spec (four-legged tribes)

SkyWing is the first tribe. Its art is built by `Tools/_WoF/skywing_sprites.js` (run `node Tools/_WoF/skywing_sprites.js`
from the repo root; it also rewrites the preview below). Hand-drawn PNGs can replace any state: keep the same file and
state names, and nothing in the code needs to change. Once a PNG is hand-edited, don't re-run the generator over it.

Draw original art from the books' written descriptions of each tribe. Don't trace or copy the covers, the
graphic novels or official illustrations, because that art can't be licensed into this repo.

![SkyWing preview](skywing_preview.png)

Default colors. A normal 32px crewmember stands on the right for scale.

SkyWing traits the art follows, from the tribe's canon description: the largest wings of any tribe, long curved
horns, a thin long snout with a nose spike, an extra horn on the jaw, and red, orange, yellow or rust scales with
amber eyes. The build is a slender Western dragon: S-curved neck holding the head high, folded wings whose
claw-tipped finger bones rise far above the back, a pale throat and belly, a small dorsal ridge, digitigrade hind
legs and a long tail that curls at the tip. The jaw horn, nose spike and dorsal ridge are part of the base
`head` and `body` sprites.

## Canvas and directions

- **Frame size:** 64×64 per frame, about two tiles wide. The frame is centered on the dragon's tile, so the tile it stands on is the middle 32×32 (x 16–47, y 16–47). Put the feet around y 46–47.
- **Directions:** every state has 4 directions. The PNG is a 128×128 sheet in a 2×2 grid:

  | | left column | right column |
  |---|---|---|
  | **top row** | south (facing the viewer) | north (facing away) |
  | **bottom row** | east (facing right) | west (facing left) |

- **Grayscale:** draw recolorable parts in grayscale using SS14's body ramp: base 182, highlight 210, mid 164, shade 148, outline 122 (top/left) and 100 (bottom/right), claws 42. The game multiplies them by the color the player picks in the character creator. Use real colors only for parts that should never be recolored.

## Files

`Resources/Textures/_WoF/Mobs/Species/<Tribe>/parts.rsi`, recolored with the player's scale color:

| State | Game layer | What to draw |
|---|---|---|
| `body` | Chest | Torso and neck |
| `head` | Head | Head and snout |
| `eyes` | Eyes | Eye pixels only, white. Tinted with the eye color. Leave the north frame empty. |
| `front_near` | RArm | Front leg(s) drawn over the body, paw included |
| `front_far` | LArm | Front leg drawn under the body, a tone darker |
| `hind_near` | RLeg | Hind leg(s) drawn over the body, foot included |
| `hind_far` | LLeg | Hind leg(s) drawn under the body |
| `full` | Icon | One frame, a colored east-facing preview |

Which legs go in which state depends on the direction:

| Direction | `front_near` | `front_far` | `hind_near` | `hind_far` |
|---|---|---|---|---|
| East / West (side) | foreleg nearest the camera | the other foreleg | hind leg nearest the camera | the other hind leg |
| South (front) | both forelegs | empty | empty | both hind legs (behind the chest) |
| North (back) | empty | empty | both hind legs | empty (the body hides the forelegs) |

`Resources/Textures/_WoF/Mobs/Customization/<Tribe>/markings.rsi` holds the parts that can be swapped or recolored separately:

| State | Layer | Coloring |
|---|---|---|
| `wings_membrane` | Wings (drawn over the body, under the head) | Wing color (SkyWing default pale gold `#f6c977`) |
| `wings_bone` | Wings | Follows scale color |
| `tail` | Tail (behind the body) | Follows scale color |
| `tail_underside` | Tail | Underside color (default gold `#f2c14e`) |
| `horns` | HeadTop | Horn color (default `#d4a056`) |
| `underbelly` | Chest (on by default) | Belly color (default `#f2c14e`) |

Extra options, like other horn shapes, frills, underbelly patterns or SeaWing glow stripes, are just more marking states plus a `marking` entry in `Resources/Prototypes/_WoF/Species/<tribe>.yml`.

## Drawing order (bottom to top)

tail → far hind leg → far front leg → body → near hind leg → near front leg → wings → head → eyes → horns → worn items

The order is the same for all four directions, so each frame is drawn to suit it:

- **Tail** is always behind; it spreads out past the body's outline. The one exception is the back view, where the tail comes toward the camera over the rump: that frame of the tail is drawn in the `body` sprite instead, and the `tail` and `tail_underside` north frames are empty.
- **Wings** draw over the body. In the side views the near wing lies over the flank and the far wing shows behind it (with the near wing and body cut out of it). In the front view the wings stand behind the shoulders, so the art leaves out every pixel the body, head or legs would cover. In the back view the folded wings lie over the back.

## Worn items

Dragons have head, neck, saddlebag (back), harness (belt), signet (ID) and two pouch slots. Items show
their human sprites until dragon versions exist. To add one, give the item's RSI states named like
`equipped-NECK-skywing` (the species ID is the suffix).

## Adding another tribe

1. Copy `Resources/Prototypes/_WoF/Species/skywing.yml` and `Resources/Prototypes/_WoF/Entities/Mobs/Species/skywing.yml`, then rename SkyWing to the new tribe.
2. Add its texture folders.
3. Add `species-name-<tribe>` in `Resources/Locale/en-US/_WoF/species.ftl`, and marking names in `Resources/Locale/en-US/_WoF/markings.ftl`.
4. Tune its flight in the mob's `MovementSpeedModifier`.
