# Snowy mountain: Stress test (dag)

At the foot of a rock face in deep snow. Three ropes hang from bolts at the top of the face (the game decides which one is rotten); a line of holds climbs the face, glazed with ice above 5.2 m; the summit ledge with a marker flag is at 8.5 m. The face is the front of a snow-and-rock massif that rises behind it; snow peaks ring the valley.

- Game file: `public/v2/dag/dag.glb` (1.3 MB, Draco + KTX2; loading as in `art/v2/mahalle/README.md`)
- Build: `art/v2/dag/build.py`
- Previews: `art/v2/dag/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up, build-script north = three.js -Z. The player's spot on the snow is the origin; the face starts 1.2 m ahead and leans back 12°.

## Budget

17,800 triangles, 19 draw calls (holds and ropes are separate nodes), 1.2 MB of textures, 1.3 MB in all.

## Named nodes

| Node | What | Pivot / notes |
|---|---|---|
| `rope_1`, `rope_2`, `rope_3` | three climbing ropes, left of the holds (x = -1.6, -1.1, -0.6), from bolts at 8.25 m down to the snow | at the bolt; swing, stretch or snap them. Grip points at chest height: `rope_1_grip` … `rope_3_grip` |
| `hold_01` … `hold_09` | rock holds from 1.1 m up to the ice line, alternating left and right, 0.42-0.55 m apart | centre of each hold (about 0.3 m rock knobs) |
| `ice_hold_01` … `ice_hold_06` | ice-glazed holds from 5.2 m to 7.8 m (separate glossy material `ice_hold`, for slipping) | as above |

## Points

| Point | Where |
|---|---|
| `seat_base` | the player's floor point on the snow, facing the face (forward = local -Z). The first hold is about 1.3 m ahead at 1.1 m; the ropes are ahead on the left |
| `rope_1_grip` … `rope_3_grip` | where each rope is at 1.1 m |
| `climb_top` | on the summit ledge above the last hold, where a finished climb ends |
| `summit` | by the marker flag |

## Notes for the game

- No lights in the file: a cold sun low from the south, a pale fog (FogExp2 about 0.004, #c8d0d8) and blowing snow work well; the peaks are plain snow so fog does the rest.
- The ice glaze over the upper face (`ice`) is blended (alpha 0.42); everything else is opaque.
- Climbing per the design: the player's hand on a hold pulls the camera; the holds are spaced for that.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k snow_02 rock_face_03 dark_rock
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for rock_07 and rock_09. Then:

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/dag/build.py -- /tmp/dag_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/dag_raw.glb public/v2/dag/dag.glb art/v2/dag/pack-report.json
```
