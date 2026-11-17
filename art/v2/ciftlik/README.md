# Farm in a drought: Prime the pump (ciftlik)

A dry farmyard: a green cast-iron pitcher pump on a plank platform, a jug of saved water beside it, a basin under the spout feeding an irrigation channel that runs 11 m to a wooden gate and splits left and right along a field of dead stalks. A red barn, a windmill tower over a stock tank, a fence, bare trees and dry hills all round.

- Game file: `public/v2/ciftlik/ciftlik.glb` (1.7 MB, Draco + KTX2; loading as in `art/v2/mahalle/README.md`)
- Build: `art/v2/ciftlik/build.py`
- Previews: `art/v2/ciftlik/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up, build-script north = three.js -Z. Pump at the origin, its spout toward the field (north); platform top y = 0.12.

## Budget

21,250 triangles, 25 draw calls; 1.7 MB in all.

## Named nodes

| Node | What | Pivot / notes |
|---|---|---|
| `pump_handle` | the iron lever with its plunger link | the fulcrum pin; rotate about local X for a stroke (grip at `pump_handle_grip`, 0.7 m toward the player) |
| `pitcher` | ceramic jug of saved water | base centre (rests at `pitcher_rest`); pour into `pump_priming_cup` |
| `pump_water_stream` | the arc of water from the spout into the basin (blended) | hide it until the pump draws |
| `basin_water` | water surface in the basin | raise it as the pump runs |
| `channel_water_main`, `channel_water_left`, `channel_water_right` | water strips on the channel bottoms (main: basin to gate; left and right: gate to the field corners) | each starts at its upstream end and runs along local -Z in three.js (+Y in Blender) for its length; scale that axis to show water advancing |
| `channel_gate` | plank gate at the split | on its post; turn it to `channel_gate_left` (sends water left) or `channel_gate_right` (right) |

## Points

| Point | Where |
|---|---|
| `seat_pump` | the stool, 1.5 m south of the pump, facing it and the channel (forward = local -Z) |
| `pump_priming_cup`, `pump_spout`, `pump_handle_grip` | the cup on top of the pump, the spout mouth, the handle's grip at rest |
| `pitcher_rest` | where the jug stands |
| `channel_gate_left`, `channel_gate_right` | the gate's two positions (rotation only) |
| `spot_farmer` | beside the platform |

## Notes for the game

- No lights in the file: a hard, high sun, a hazy warm fog (FogExp2 about 0.004, #d9cdb4) and heat shimmer suit the drought. When the field is saved, the dead stalks and soil can be tinted greener.
- Water materials (`clear_water`) are blended with alpha 0.75.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k dry_mud_field_001 farm_soil old_wood_floor brown_planks_05 box_profile_metal_sheet bark_brown_02
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for each Poly Haven id in `sources.json`. Then:

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/ciftlik/build.py -- /tmp/ciftlik_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/ciftlik_raw.glb public/v2/ciftlik/ciftlik.glb art/v2/ciftlik/pack-report.json
```
