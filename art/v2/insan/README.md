# People (insan)

Realistic, rigged and animated people for v2, one GLB each in `public/v2/insan/`. Bodies, skins, hair and clothes are MakeHuman's CC0 system assets, put together with MakeHuman's MPFB add-on for Blender (used only as a tool). Motions are real motion capture from the CMU database, retargeted onto MakeHuman's `cmu_mb` skeleton. No logos: garments that carry the MakeHuman logo are not used.

| File | Who | Triangles | Draw calls | Size |
|---|---|---|---|---|
| `gray.glb` | Prime Minister Gray, 50s: grey hair, dark suit | 10,899 | 4 | 0.62 MB |
| `maya.glb` | Maya Brooks, persona (42 in 2041): striped blouse, skirt | 10,158 | 4 | 0.70 MB |
| `leo.glb` | Leo Carter, persona: denim shirt and jeans | 8,373 | 4 | 0.67 MB |
| `sam.glb` | Sam Reed, persona: work overalls | 8,405 | 4 | 0.65 MB |
| `walt.glb` | Walt Webb, memory keeper (Safety net), about 80: field jacket, jeans | 8,995 | 4 | 0.70 MB |
| `june.glb` | June Parker, memory keeper (Firewall), about 75: olive field jacket | 9,648 | 4 | 0.66 MB |
| `ben.glb` | Ben Marsh, memory keeper (Bail out), about 75: yellow oilskin overalls | 8,405 | 4 | 0.63 MB |
| `helen.glb` | Helen Stone, memory keeper (Stress test), about 60: red climbing jacket | 9,798 | 4 | 0.70 MB |
| `edna.glb` | Edna Wells, memory keeper (Prime the pump), about 75: denim overalls | 8,483 | 4 | 0.65 MB |
| `george.glb` | George Penn, memory keeper (Ring-fence), about 80: navy guard uniform | 10,899 | 4 | 0.63 MB |
| `crowd_man_suit.glb` | Crowd: townsman in a dark suit (bank queue, bankers) | 8,605 | 4 | 0.60 MB |
| `crowd_man_casual.glb` | Crowd: townsman in a striped shirt and jeans | 11,540 | 4 | 0.66 MB |
| `crowd_woman_a.glb` | Crowd: young townswoman in sportswear | 9,090 | 4 | 0.64 MB |
| `crowd_woman_b.glb` | Crowd: townswoman in an office blouse and skirt | 9,560 | 4 | 0.66 MB |

All fourteen share the same skeleton and the same five clips. Eight on screen at once come to about 80k triangles and 32 draw calls. For a larger crowd, clone the four crowd files (`SkeletonUtils.clone`) and vary them in the game: start each clip at a random time, scale by 0.95-1.05, and mirror some (`scale.x = -1`).

Previews: `art/v2/insan/preview/<name>.jpg` (idle, walk, talk, point, cheer). Per-character numbers: `art/v2/insan/stats/<name>.json`.

Hand props from the design (Edna's pitcher, Helen's coiled rope, George's keyring, Walt's chalked hands) are not modelled on the people. The pitcher is in the farm scene (`pitcher`); attach props to the `LeftHand` / `RightHand` bones in the game. The memory keepers are old people, but the clips are the same adult motions; slow `walk` with `timeScale` 0.8 and move them at about 1.3 m/s if they should look older.

## In each GLB

- One armature (the node named after the character) with 31 bones, CMU names: `Hips`, `LHipJoint`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `RHipJoint`, `RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase`, `LowerBack`, `Spine`, `Spine1`, `Neck`, `Neck1`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftFingerBase`, `LeftHandFinger1`, `LThumb` and the same on the right.
- Three skinned meshes: `<name>_skin` (body, own 1024 texture), `<name>_outfit` (clothes, shoes and eyes baked into one 1024 texture), `<name>_hair` (hair and eyebrows, two alpha-cut 512 textures). Draco geometry, KTX2 textures.
- Origin at the feet, facing +Z (three.js forward toward a default camera), 1.65-1.85 m tall, metres.
- Five animation clips, all in place (the hips stay over the origin; the game moves the node):

| Clip | Source (CMU) | Length | Loops |
|---|---|---|---|
| `idle` | 111_28 "Standing still" | 6.0 s | yes |
| `walk` | 08_01 "walk", one stride | 1.0 s | yes; move the node at 1.59 m/s to keep the feet from sliding |
| `talk` | 18_08 "conversation, explain with hand gestures" | 6.0 s | yes |
| `point` | 13_27 "direct traffic, wave, point": an arm reaching out | 2.6 s | no (play once, then back to idle) |
| `cheer` | 142_09 "Joy": both arms up | 3.2 s | no |

Hands and fingers keep MakeHuman's relaxed rest relative to the forearm (CMU's hand data is coarse).

## Use in the game

```ts
const gltf = AssetManager.getGLTF('gray');           // or GLTFLoader
const mixer = new AnimationMixer(gltf.scene);
const idle = mixer.clipAction(AnimationClip.findByName(gltf.animations, 'idle'));
idle.play();
// one-shots: action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; crossfade back to idle
```

Several characters can share one file through `SkeletonUtils.clone` (IWSDK's `AssetManager.getGLTF` already returns clones).

## Matching the Quaternius characters the code uses now

| Here | Quaternius (Ultimate Animated Character Pack) |
|---|---|
| `idle` | `Idle` |
| `walk` | `Walk` |
| `talk` | none (use `Idle`) |
| `point` | `Wave` is the closest |
| `cheer` | `Wave` / `Yes` |

The skeletons differ (CMU names here, Quaternius names there), so clips do not transfer between the two sets; each character here carries its own five clips.

## Rebuilding

MPFB 2.0.18 (https://github.com/makehumancommunity/mpfb2, `src/mpfb` zipped as a Blender extension) and the CC0 system assets (https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip) are installed into a separate Blender resources folder, so the everyday Blender setup is not touched:

```bash
BLENDER_USER_RESOURCES=<dir> blender -b --factory-startup --command extension install-file -r user_default -e mpfb_ext.zip
```

Unzip the asset pack into `<dir>/extensions/.user/user_default/mpfb/data/`. The CMU BVH files come from https://github.com/una-dinosauria/cmu-mocap (`data/<subject>/<clip>.bvh`) into `$V2_CACHE/cmu/`. Then, per person in `characters.json`:

```bash
BLENDER_USER_RESOURCES=<dir> V2_CACHE=<cache> nice -n 20 blender -b --python art/v2/insan/build.py -- gray /tmp/gray_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/gray_raw.glb public/v2/insan/gray.glb
```

Notes on the build: MPFB's own "feet on ground" step, run headless, lifts only some bones, so the build makes the person in MakeHuman's coordinates and lifts skeleton and meshes together. Retargeting is per bone in world space; only limb bones are turned from MakeHuman's A-pose to the BVH's T-pose reference (MakeHuman's `Neck1` points down, so the trunk and head keep their own rest).
