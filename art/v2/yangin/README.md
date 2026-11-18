# Forest fire edge: Firewall (yangin)

A clearing at the edge of a dry fir forest. The fire comes from the north, where charred trunks and ash already stand. In front of the player a staked firebreak line (orange tape) waits to be dug; a second line runs north-south to the right for when the wind turns. A rusty spade leans by the player's seat, a burlap sack lies wet by a bucket of water on the left.

- Game file: `public/v2/yangin/yangin.glb` (1.1 MB, Draco + KTX2; loading as in `art/v2/mahalle/README.md`)
- Build: `art/v2/yangin/build.py`; tree billboards from `art/v2/tools/impostor.py`
- Previews: `art/v2/yangin/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up, build-script north = three.js -Z. The player's spot is the origin.

## Budget

7,900 triangles, 27 draw calls (16 of them are the strip cover patches, so the game can hide them one by one); 1.1 MB in all.

## Named nodes

| Node | What | Pivot / notes |
|---|---|---|
| `strip1_cover_01` … `strip1_cover_08` | undisturbed ground over each 1.25 m segment of firebreak 1 (across the front, y = 3..4, x = -5..5) | start of its segment. Hide (or sink) a cover when that segment is dug: the soil trench below shows |
| `strip2_cover_01` … `strip2_cover_06` | same for firebreak 2 (x = 4.1..5.1, y = -4..2.2, to the player's right) | as above |
| `shovel` | rusty spade | top of the handle (the grip); it rests at `shovel_rest` leaning on the stump side |
| `wet_sack` | wet burlap sack, 0.72 x 0.48 m | its centre; rests at `wet_sack_rest`; dip it at `sack_bucket_dip` |

## Points

| Point | Where |
|---|---|
| `seat_clearing` | the player's floor point, facing the fire (north; forward = local -Z) |
| `strip1_dig_01` … `_08`, `strip2_dig_01` … `_06` | the middle of each segment, facing along the strip: where the spade goes in |
| `spark_spot_01` … `spark_spot_10` | ground points on the player's side of strip 1 where embers can land and catch |
| `fire_source_1` … `fire_source_5` | in the forest beyond the strips (north) and to the east (for the wind change) |
| `shovel_rest`, `wet_sack_rest`, `sack_bucket_dip` | where the tools rest; the water surface in the bucket |

## Notes for the game

- No lights and no fire in the file: fire, smoke and embers are the game's effects at `fire_source_*` and `spark_spot_*`. An orange key light from the north, a smoky warm fog (FogExp2 about 0.02, #8a7a6a) and drifting ash work well.
- The firs are alpha-cutout cards (`fir_card`, double-sided) rendered from the Poly Haven Fir Sapling scan; they hold up from about 4 m.
- The bucket water reflects the sky; it reads as a bright disc in direct light.

## How the game uses it (S09, `src/v2/game/forest-fire.ts`)

- The player does not sit at `seat_clearing`: she kneels 0.75 m behind the middle of the piece she is digging (eye 1.2 m up), first along strip 1 from its west end, then, when the wind turns, along strip 2 from its north end, facing east. The pieces are taken in the order of their `*_dig_*` points along the strip.
- A cover is hidden when its piece is dug; the game adds a mound of earth on the far edge and a ranging pole at the end of the stretch being dug. `strip2_cover` at the south end is hidden from the start (the crew's work).
- `shovel` and `wet_sack` are hidden: the ranger's own spade and sack are made by the game and go with her. `spark_spot_*` and `fire_source_*` are not used (embers land beside where she kneels; the front is placed from the strip).
- The fire is the game's: three rows of flame cards up to 8 m tall, a glow, two orange point lights that follow the front, embers on the wind. The sky and fog go from a smoky dusk to deep orange as the front nears.
- Numbers (speeds, distances, strokes, embers) are in `src/v2/fire-line.ts`, tested in `tests/fire-line.test.mjs`.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k forest_ground_04 farm_soil bark_willow
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for fir_sapling, rusted_spade_01 and wooden_bucket_01. Then:

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/tools/impostor.py -- "$V2_CACHE/fir_sapling/fir_sapling_1k.gltf" fir_sapling_a "$V2_CACHE/gen/fir_impostor.png" 768
```

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/yangin/build.py -- /tmp/yangin_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/yangin_raw.glb public/v2/yangin/yangin.glb art/v2/yangin/pack-report.json
```
