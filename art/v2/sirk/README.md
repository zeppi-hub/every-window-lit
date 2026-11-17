# Circus big top: Safety net (sirk)

Inside a red-and-cream big top: a high wire 6 m up between two platforms, and below it a safety net on wheels. The player sits on the sawdust just outside the ring and pulls two ropes to slide the net under the falling acrobats. Empty bleachers all round, follow spots, hanging lamps, bunting, pedestals; the performers' entrance is a curtain on the east side.

- Game file: `public/v2/sirk/sirk.glb` (1.3 MB, Draco + KTX2; loading as in `art/v2/mahalle/README.md`)
- Build: `art/v2/sirk/build.py`; prints from `art/v2/tools/textures_sirk.py`
- Previews: `art/v2/sirk/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up, build-script north = three.js -Z. Floor y = 0, ring centre at the origin.

## Budget

11,800 triangles, 28 draw calls, 1.1 MB of textures, 1.3 MB in all.

## Named nodes

| Node | What | Pivot / notes |
|---|---|---|
| `safety_net` | net (alpha-masked cords), metal frame 3.6 x 3.0 m at 1.45 m, four legs on casters | floor, centre of the net. Slide it along X (three.js X too) between `net_limit_left` and `net_limit_right` (x = -4.6 .. 4.6); the sagging net surface is 1.03-1.45 m high |
| `high_wire` | steel cable from x = -6.7 to 6.7 at 6.02 m | static; can sway in stage 3 |
| `net_line_left`, `net_line_right` | rope from each pulley to the net's side | pivot at the pulley; the mesh runs along local +Y, rest length 6.42 m. To follow the net: point local +Y at the net's side (net centre ± 1.8 m in X, 1.45 m up) and scale Y by distance / 6.42 |
| `net_rope_left`, `net_rope_right` | rope from each pulley to the player's handle | pivot at the pulley, along local +Y, rest length 8.41 m |
| `rope_handle_left`, `rope_handle_right` | wooden T-grips, 0.28 m, at hand height in front of the seat | grip centre; pulling a handle toward the player moves the net to that side |

## Points

| Point | Where |
|---|---|
| `seat_ringside` | floor point of the player's seat, 7.6 m south of the wire, facing north (forward = local -Z). The handles are 0.6 m ahead at 0.95 m, ±0.45 m left and right |
| `acrobat_start_1` … `_3` | on the wire at x = -3.6, 0.4, 3.9 (stage 1 uses one, stage 3 all three) |
| `spot_platform_left`, `spot_platform_right` | platform tops, facing the wire |
| `pulley_left`, `pulley_right` | the two pulleys at the ring's edge |
| `net_limit_left`, `net_limit_right` | ends of the net's travel |

## Notes for the game

- No lights in the file. The canvas reads warm with one strong light under the roof and two spots on the wire; the follow-spot lenses (`spot_lens`) and lamp glass are emissive.
- The net material is alpha-masked (cutout), double-sided; everything else is opaque.
- Wind in stage 3 can sway `safety_net` and `high_wire`; the tent itself is static.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k aerial_wood_snips brown_planks_05 velour_velvet fabric_pattern_07
```

```bash
python3 -P art/v2/tools/textures_sirk.py "$V2_CACHE/gen"
```

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/sirk/build.py -- /tmp/sirk_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/sirk_raw.glb public/v2/sirk/sirk.glb art/v2/sirk/pack-report.json
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for each Poly Haven id in `sources.json`.
