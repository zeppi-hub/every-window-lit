# Ship in a storm: Bail out (gemi)

The waist deck of a three-masted sailing ship in a heavy swell. The player sits on a low step aft of the capstan, facing the starboard rail: a bilge well with rising water at the left front, a bucket at the right, a sail rope to belay at the pin rail ahead, and a sweep oar through a port in the bulwark at the right front. A drum stands behind on the left for the rowing beat.

- Game file: `public/v2/gemi/gemi.glb` (1.9 MB, Draco + KTX2; loading as in `art/v2/mahalle/README.md`)
- Build: `art/v2/gemi/build.py`
- Previews: `art/v2/gemi/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up. In the file the bow points along +X, the starboard side (where the player looks) is +Z in three.js (Blender -Y), waterline y = 0, the waist deck about 1.85 m.

## Hierarchy

Two roots, so the world can move without moving the camera:

- `ship`: pivot at the waterline under the middle of the ship. Hull, rigging, the interactive parts and every point below are its children; rock and heave this node.
- `sea`: a 188 m disc with a baked swell (largest near the ship, fading outward), its own node for the game to bob, scroll or animate.

## Budget

40,300 triangles (ship 30k, sea 3.7k), 23 draw calls, 1.6 MB of textures, 1.9 MB in all.

## Named nodes (children of `ship`)

| Node | What | Pivot / notes |
|---|---|---|
| `hold_water` | water surface inside the bilge well (0.72 x 0.62 m) | its centre; move along local Y between `water_level_min` and `water_level_max`. Losing line at `water_line` (painted white stripe with notches on the far wall) |
| `bucket` | wooden bucket | bottom centre; grip at `bucket_grip` |
| `sail_rope` | the sheet from the belaying pin up to the main course's lower corner | at the pin, mesh along local +Y, rest length 6.12 m (to `sail_clew`) |
| `sail_rope_handle` | coil of the rope's free end on the deck below the pin | coil centre |
| `sails` | all sails (one mesh) | for flapping or a wind squeeze |
| `oar` | sweep oar through the port | at the oar port (rotate about it for the stroke); handle at `oar_handle` |
| `drum` | drum on legs for the stroke | floor centre |

## Points (children of `ship`)

| Point | Where |
|---|---|
| `seat_deck` | top of the step, where the seated player's floor goes; facing the starboard rail (forward = local -Z). The rail top is 0.8 m above it, so a seated player sees the sea |
| `water_level_min`, `water_line`, `water_level_max` | heights of `hold_water`: start, losing line, brim |
| `bucket_grip`, `bucket_rest` | the bucket's handle top and where it stands |
| `dump_point_1`, `dump_point_2` | rail top in front of the player, where water goes overboard |
| `sail_rope_tie`, `sail_clew` | the belaying pin (tie here) and the sail corner the rope runs to |
| `oar_handle` | the oar's grip at rest |
| `spot_drummer`, `spot_captain` | beside the drum; the quarterdeck |

## Notes for the game

- No lights and no sky in the file: a dark storm sky, a grey-blue fog (FogExp2 about 0.01) and rain sell the storm. The sea material is a dark, glossy dielectric that reflects the environment map.
- "World moves, camera doesn't": rock `ship` (roll ±6-10°, pitch ±3°, heave ±0.5 m) and bob `sea` out of phase; Less motion scales it down.
- The rigging is decimated to 13k triangles; thin lines may look broken up close.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k old_wood_floor
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for each Poly Haven id in `sources.json`. Then:

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/gemi/build.py -- /tmp/gemi_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/gemi_raw.glb public/v2/gemi/gemi.glb art/v2/gemi/pack-report.json
```
