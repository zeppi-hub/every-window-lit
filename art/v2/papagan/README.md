# Parrot (papagan)

One perched macaw, `public/v2/papagan/parrot.glb`: 0.22 MB, 5,999 triangles, 1 draw call, one 1024 KTX2 texture, Draco geometry. For the broadcast screen (the parrot on the leader's shoulder, the player's mirror) and anywhere the bird is seen whole.

![preview](preview/parrot.jpg)

## Nodes

| Node | What |
|---|---|
| `parrot_root` | The node to place. Origin where the claws grip, so it can sit on a shoulder, a perch or `spot_parrot_*` in the scenes. Looks along +Z (three.js), like the people. |
| `parrot` | The mesh (body, wings and tail in one piece). |
| `perch_grip` | Same as the origin: the point to put on the perch or shoulder. |
| `head_top` | Top of the head, 0.35 m above the grip, 0.19 m forward. |
| `beak_tip` | Tip of the beak, 0.24 m forward of the grip. |
| `tail_tip` | End of the tail, 0.45 m below and 0.51 m behind the grip. |

Size: 0.80 m from tail tip to head top, 0.75 m long, 0.22 m across. That is a large macaw, tail included. On a shoulder, place `parrot_root` on the top of the shoulder, a little to the side of the neck. Scale it in the game if the bird should look smaller.

## Limits

- Static pose, no skeleton, no animation. The wings are part of the body mesh, not separate nodes, so the bird cannot flap. Bob or tilt `parrot_root` in the game for life (a small turn of the head can be faked by rotating the whole node around `perch_grip`).
- The player's own wing on the left shoulder (with its feather slots and the grey feather) is built in the game code and is not in this file.

## Rebuilding

```bash
nice -n 20 blender -b --factory-startup --python art/v2/tools/prep_model.py -- --in $V2_CACHE/sketchfab/eedf3a271ae742129282ff74ab8603f9.glb --out /tmp/parrot_raw.glb --name parrot --tris 6000 --tex 1024 --height 0.8
```

```bash
nice -n 20 blender -b --factory-startup --python art/v2/papagan/build.py -- /tmp/parrot_raw.glb /tmp/parrot_built.glb --preview /tmp/parrot_prev
```

```bash
node art/v2/tools/pack.mjs /tmp/parrot_built.glb public/v2/papagan/parrot.glb art/v2/papagan/pack-report.json
```

The source model is downloaded with `python3 art/v2/tools/sketchfab.py get $V2_CACHE eedf3a271ae742129282ff74ab8603f9` (CC BY 4.0; see sources.json and art/v2/CREDITS-v2.md).
