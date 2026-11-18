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

## The player's own body: wing, breast, feet (`player_wing.glb`) and wing-tip feathers (`wing_tips.glb`)

The player is the parrot. These take the place of the placeholder shapes in `parrot-system.ts` (the feather planes, sphere, bib and claws of the `ParrotWing` group) and of the feather planes in `wing-hands-system.ts`. Colours follow the scarlet macaw of `parrot.glb`, the bird she sees of herself on the broadcast screen: red edge and lesser coverts, yellow median coverts tipped green, blue flight feathers. Feathers are real strips (a raised shaft, a slight curve) with one alpha-cut picture (glTF MASK, cutoff 0.5, double-sided).

![wing from the eye](preview/player_wing.jpg)

**`public/v2/papagan/player_wing.glb`**, 3,120 triangles, 6 draw calls. Laid out in the frame of the `ParrotWing` group exactly as the game builds it (three.js metres: x to the bird's right, y up, -z ahead; the game places the group 0.08 m right, 0.27 m down and 0.34 m ahead of the eye, turned with the head's heading), so it can be added to that group as it is.

| Node | What |
|---|---|
| `ParrotWing` | the root (the group's origin) |
| `wing_flight_feathers` | 16 flight feathers fanned ahead from roots along x = -0.02 … -0.42, blue-green near the body, blue to the tip, 0.17-0.25 m long; the face tilted 0.45 rad up toward the eye like the game's fan |
| `wing_coverts` | two overlapping rows over their roots: 18 yellow coverts tipped green, 18 small red ones |
| `wing_edge` | the wing's red leading edge from the shoulder (x 0.02) to the wrist (x -0.44), under the coverts' roots |
| `breast` | the red breast under the chin, centred at (-0.08, -0.05, 0.3), 0.2 m wide and 0.25 m tall, feathered picture |
| `feet`, `claws` | two grey feet at (-0.08 ± 0.045, -0.15, 0.24), two toes forward and two back curling round the perch, black claws |

The word feathers the game hangs on the wing (its slots) are not in the file; they still come from the game's `featherMesh` (which could take `feather_primary` from `wing_tips.glb` as its shape).

**`public/v2/papagan/wing_tips.glb`**, 128 triangles, one material. Four feather templates for the wing-tip hands, side by side in the file; each is 1 m long from its quill (the node's origin) to its tip along -x, flat on the xz plane with its top face up +y, so `scale.setScalar(0.08 … 0.14)` gives a finger's feather and the game's current holders (turned -π/2 about y on each finger joint) work unchanged. The templates already lie flat: give them no `rotation.x = -π/2` (that turn is only for the game's `PlaneGeometry` feathers), and no `position.x = -long / 2` (the quill is already at the origin).

| Node | Width (share of length) | Use |
|---|---|---|
| `feather_primary` | 0.24 | thumb and forefinger (the long, narrow blue ones that close like tweezers) |
| `feather_secondary` | 0.28 | middle, ring and little finger |
| `feather_covert_yellow` | 0.42 | the tuft on the back of the hand (wrist) |
| `feather_covert_red` | 0.42 | a red tuft, if wanted at the wrist |

Take a template with `getObjectByName`, `clone()` it per joint, and drop its own `position` (the file spreads them 0.35 m apart along z for viewing).

Rebuilding:

```bash
python3 -P art/v2/papagan/wing_textures.py /tmp/wing_tex
```

```bash
nice -n 20 blender -b --factory-startup --python art/v2/papagan/player_wing.py -- wing /tmp/player_wing_raw.glb /tmp/wing_tex --preview /tmp/prev
```

```bash
nice -n 20 blender -b --factory-startup --python art/v2/papagan/player_wing.py -- tips /tmp/wing_tips_raw.glb /tmp/wing_tex --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/player_wing_raw.glb public/v2/papagan/player_wing.glb
```

```bash
node art/v2/tools/pack.mjs /tmp/wing_tips_raw.glb public/v2/papagan/wing_tips.glb
```

Everything here (shapes and pictures) is made in these two scripts; no outside source.
