# People (insan)

Realistic, rigged and animated people for v2, one GLB each in `public/v2/insan/`. Bodies, skins, hair and clothes are MakeHuman's CC0 system assets, put together with MakeHuman's MPFB add-on for Blender (used only as a tool). Motions are real motion capture from the CMU database, retargeted onto MakeHuman's `cmu_mb` skeleton (`art/v2/insan/motion.py`, see "How the motion is put on") and checked frame by frame: a build stops if any frame breaks the pose rules below. No logos: garments that carry the MakeHuman logo are not used.

| File | Who | Triangles | Draw calls | Size |
|---|---|---|---|---|
| `gray.glb` | Prime Minister Gray, 50s: grey hair, dark suit | 10,899 | 4 | 0.62 MB |
| `maya.glb` | Maya Brooks, persona (42 in 2041): striped blouse, skirt | 10,158 | 4 | 0.70 MB |
| `leo.glb` | Leo Carter, persona: denim shirt and jeans | 8,373 | 4 | 0.67 MB |
| `sam.glb` | Sam Reed, persona: work overalls | 7,533 | 4 | 0.65 MB |
| `walt.glb` | Walt Webb, memory keeper (Safety net), about 80: field jacket, jeans | 8,995 | 4 | 0.70 MB |
| `june.glb` | June Parker, memory keeper (Firewall), about 75: olive field jacket, short grey hair | 8,999 | 4 | 0.66 MB |
| `ben.glb` | Ben Marsh, memory keeper (Bail out), about 75: yellow oilskin overalls | 10,161 | 4 | 0.63 MB |
| `helen.glb` | Helen Stone, memory keeper (Stress test), about 60: red climbing jacket | 9,798 | 4 | 0.70 MB |
| `edna.glb` | Edna Wells, memory keeper (Prime the pump), about 75: denim overalls | 8,483 | 4 | 0.65 MB |
| `george.glb` | George Penn, memory keeper (Ring-fence), about 80: navy guard uniform | 10,899 | 4 | 0.63 MB |
| `crowd_man_suit.glb` | Crowd: townsman in a dark suit (bank queue, bankers) | 8,605 | 4 | 0.60 MB |
| `crowd_man_casual.glb` | Crowd: townsman in a navy jacket | 10,740 | 4 | 0.66 MB |
| `crowd_woman_a.glb` | Crowd: young townswoman in a camel rain jacket, hair tied back | 9,398 | 4 | 0.64 MB |
| `crowd_woman_b.glb` | Crowd: townswoman in a dark red trouser suit | 9,355 | 4 | 0.66 MB |

All fourteen share the same skeleton and the same five clips. Eight on screen at once come to about 80k triangles and 32 draw calls. For a larger crowd, clone the four crowd files (`SkeletonUtils.clone`) and vary them in the game: start each clip at a random time, scale by 0.95-1.05, and mirror some (`scale.x = -1`).

Previews: `art/v2/insan/preview/<name>.jpg` (idle, walk, talk, point, cheer). Per-character numbers: `art/v2/insan/stats/<name>.json`.

Hand props from the design (Edna's pitcher, Helen's coiled rope, George's keyring, Walt's chalked hands) are not modelled on the people. The pitcher is in the farm scene (`pitcher`); attach props to the `LeftHand` / `RightHand` bones in the game. The memory keepers are old people, but the clips are the same adult motions; slow `walk` with `timeScale` 0.8 and move them at about 1.3 m/s if they should look older.

## In each GLB

- One armature (the node named after the character) with 31 bones, CMU names: `Hips`, `LHipJoint`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `RHipJoint`, `RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase`, `LowerBack`, `Spine`, `Spine1`, `Neck`, `Neck1`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftFingerBase`, `LeftHandFinger1`, `LThumb` and the same on the right.
- Faces made to read from a few metres (see "Faces" below). No hair covers the forehead or an eye; the four crowd people are dressed for the rainy 2008 bank queue (jackets and a suit, no bare skin).
- Three skinned meshes: `<name>_skin` (body, own 1024 texture), `<name>_outfit` (clothes, shoes and eyes baked into one 1024 texture), `<name>_hair` (hair and eyebrows, two 512 textures, alpha-cut: glTF `alphaMode` MASK, `alphaCutoff` 0.5, so three.js sets `alphaTest` 0.5 and nothing needs sorting). Draco geometry, KTX2 textures.
- Origin at the feet, facing +Z (three.js forward toward a default camera), 1.65-1.85 m tall, metres.
- Five animation clips, all in place (the hips stay over the origin; the game moves the node):

| Clip | Source (CMU) | Length | Loops |
|---|---|---|---|
| `idle` | 77_02 "standing": arms hanging, small shifts of weight | 6.0 s | yes |
| `walk` | 08_01 "walk", one stride | 1.0 s | yes; move the node at 1.59 m/s to keep the feet from sliding |
| `talk` | 18_08 "conversation, explain with hand gestures" | 6.0 s | yes |
| `point` | 13_27 "direct traffic, wave, point": a wave, then an arm reaching out | 2.2 s | no (play once, then back to idle) |
| `cheer` | 79_69 "very happy": both arms up in a V, then hands on the hips | 2.5 s | no |

Hands and fingers keep MakeHuman's relaxed rest relative to the forearm (CMU's hand data is coarse). The head keeps its motion relative to the chest minus the clip's average turn, so nobody looks at the floor for a whole clip (the standing performer looked 35 degrees down).

## Faces

Checked in three.js from 2.5 m (a headset's 20 pixels per degree): `art/v2/insan/preview/face_<name>.jpg` (front, three-quarter, and a zoomed check).
- The head's part of the skin picture gets its detail lifted (an unsharp mask of about 8 px on the 1024 picture) and its darker features darkened a little: brows painted in the skin, lids, nostrils, lips.
- Eyebrow pictures are darker and a pixel thicker; for grey- and white-haired people a clear mid grey instead (never black).
- The eyes get four times the size in the outfit atlas (sixteen times the pixels); small eyes in the atlas were the blurred "eye area".
- Hair: no fringe over the forehead or an eye (`crowd_woman_a` and Edna tie theirs back, June and Ben wear theirs short, Sam's is swept back).

## How the motion is put on (motion.py)

1. The target is first put into the source's rest pose (the BVH T-pose) by forward kinematics, parents first: each bone follows its parent rigidly, then a limb bone swings onto the source's rest direction. So the forearm's twist stays tied to the upper arm's.
2. Every source bone's world turn from its rest, `D(t) = S(t) · S_rest⁻¹`, is applied to that reference: `W(t) = D(t) · T_ref`; each bone's local rotation is then `W_parent⁻¹ · W` in the bones' rest frames.
3. The clavicles (`LeftShoulder`, `RightShoulder`) and the hip joints take no motion: they stay in their rest pose on `Spine1` and `Hips`, so the shoulders keep their width.
4. Elbows and knees are hinges: the bend angle is the source's, limited to 0-150 degrees, and it happens only about the hinge axis that MakeHuman's own rest bend defines; the upper arm is turned about its own length so its hinge plane holds the source's forearm (elbow and wrist stay where the source puts them). Forearm twist follows the source within ±60 degrees.
5. Body size: the CMU performers are slimmer (and some taller) than these people, so each arm is turned outward about the chest's forward axis, by the least angle that keeps the elbow 19 cm from the trunk's axis, the wrist outside the trunk and every point of the hand 13.5 cm from the face (smoothed over time; at most 12.5 degrees, 18.5 in one clip of the shortest woman).
6. The shoulders' skin weights are smoothed (30 passes over the vertices within 22 cm of each shoulder joint, not toward the chest), so an arm coming down from MakeHuman's A-pose rounds the shoulder instead of leaving a square pad with a notch under it.

## Pose rules, checked on every frame of every clip

`motion.check` plays each clip in Blender and measures every frame; if one rule fails the build stops and exports nothing (`--warn-only` exports anyway, for looking into a failure):

- the shoulder joints (heads of `LeftArm`, `RightArm`) stay at least 97 % of their rest distance apart;
- each elbow stays at least 18 cm from the trunk's axis (`Hips` head to `Neck` head);
- each elbow bends 0-150 degrees and no more than 15 degrees out of its hinge plane;
- neither wrist goes inside the trunk (85 % of the measured cross-section of `Hips`, `LowerBack`, `Spine`, `Spine1`, skin and clothes together);
- no point of a hand (wrist, knuckles, fingertip) comes within 12 cm of the face, unless the clip is marked `face_ok` in `clips.json` (none is).

The smallest and largest values per clip are in `stats/<name>.json` under `check`. In all fourteen (every frame of every clip): shoulders 100 % of rest width, elbows at least 19 cm from the axis, elbow bends 7-113 degrees, at most 1.2 degrees off the hinge, no wrist in the trunk, hands at least 13.5 cm from the face. The closest to the face is the wave in `point` on the shortest woman (`crowd_woman_a`), which the arm correction turns out by up to 18.5 degrees; the clip also stops at 2.2 s, before the performer's hand comes back to his chest.

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

Notes on the build: MPFB's own "feet on ground" step, run headless, lifts only some bones, so the build makes the person in MakeHuman's coordinates and lifts skeleton and meshes together. Frame 1 of every Hahne BVH is a T-pose, not motion; the clip picker starts after it. The CMU files used are 08_01, 13_27, 18_08, 77_02 and 79_69.

## Trial: photo-textured people from Microsoft Rocketbox (MIT)

`public/v2/insan/deneme/gray.glb` is Gray made from the Microsoft Rocketbox avatar library (github.com/microsoft/Microsoft-Rocketbox, MIT licence, copy in `LICENSE-rocketbox.txt`): avatar `Male_Adult_03`, photo-textured head (2048) and clothes (1024), 7,200 triangles, 3 draw calls, 1.73 MB. Same armature name, the same 31 bone names, mesh names (`gray_skin`, `gray_outfit`, `gray_hair`) and five clips as `gray.glb`, so it can take its place without code changes; every frame passes the same pose check.

![old and new Gray from 0.3, 1.5 and 4 m](preview/deneme_gray_compare.jpg)

`art/v2/insan/rocketbox.py` does it: the FBX's transforms are baked into the data (the Biped bones are freed from each other first, so no joint moves twice; the FBX take that keys the old unit scale is dropped), Biped bones are renamed to the CMU names, the rest of the fingers, toes, twist and face bones give their weights to the nearest kept bone above them, the clavicles are hung on `Spine1`, and `LHipJoint`, `RHipJoint`, `Neck1` are added with no weight. `motion.py` now takes a limb bone's direction from joint to joint (Rocketbox feet point level at the ankle), the facing from ankle to the ball of the foot, and, for a straight rest limb, bends elbows forward and knees back.

The avatar's files come from the repository's raw files: `Assets/Avatars/<group>/<avatar>/Export/<avatar>.fbx` and everything in `.../Textures/` (no account needed).

```bash
V2_CACHE=<cache> nice -n 20 blender -b --python art/v2/insan/rocketbox.py -- <cache>/rocketbox/Male_Adult_03/Export/Male_Adult_03.fbx <cache>/rocketbox/Male_Adult_03/Textures gray /tmp/gray_raw.glb --head 2048 --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/gray_raw.glb public/v2/insan/deneme/gray.glb
```
