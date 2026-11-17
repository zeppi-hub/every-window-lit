# Neighbourhood, 2008 (mahalle)

A small, fully 3D piece of a US-style downtown on the first day of the 2008 crisis: a square with a savings bank, two side streets, a back alley behind the bank, a factory at the far end and a fogged skyline. Every building has all four sides and a roof; the sides that face away from every place the player can be (the outer backs of the three rows, the north ends of the side rows, the back and ends of the factory and of the north block, and the four filler blocks behind the factory) are plain walls of the building's own brick or plaster with their corner piers, so they only show as plain from outside the town. All names and signs are generic English (no real brand, place or person).

- Game file: `public/v2/mahalle/mahalle.glb` (7.3 MB)
- Build: `art/v2/mahalle/build.py` (Blender 5.2), packed by `art/v2/tools/pack.mjs`
- Previews: `art/v2/mahalle/preview/*.jpg` (Blender Eevee); budget numbers: `stats.json`, `pack-report.json`
- Sources and licences: `sources.json`, listed in `art/v2/CREDITS-v2.md`

## Loading

One GLB with Draco geometry (`KHR_draco_mesh_compression`) and KTX2 textures (`KHR_texture_basisu`). IWSDK's `AssetManager` glTF loader handles both (it sets a DRACOLoader and a KTX2Loader; by default their decoders come from the three.js CDN, or point `dracoDecoderPath` / `ktx2TranscoderPath` at local copies). Checked in plain three.js r185 with GLTFLoader + DRACOLoader + KTX2Loader: loads in about 2 s on a laptop, no errors.

Units are metres. glTF is Y-up; the build script's north (+Y in Blender) is **-Z** in three.js. The plaza centre is the origin, the sidewalk top is y = 0.15.

## Budget (Quest)

| | |
|---|---|
| Triangles, whole scene | 140,500 (was 201,700) |
| Draw calls, whole scene | 36 (was 80): 28 merged static meshes, one per material, and the 8 meshes of the named nodes |
| Measured in three.js, both eyes (96° x 96° each, frustum culling on) | S05 from Gray's shoulder 66 draws, 274k triangles (was 116, 343k) · S15 from the door lamp 62, 274k (was 106, 343k) · plaza bench facing north 64, 275k (was 140, 377k) |
| Triangles in view (110° x 96° field, one eye) | plaza seat facing the bank 76,400 · facing the bakery 30,900 · facing south 27,800 · alley 32,200 |
| Textures | 6.0 MB KTX2: colour maps ETC1S (1024 for facades and ground, 512 for props), normal maps UASTC (512 / 256), roughness-metal ETC1S (256 / 128); the sign atlas is 2048 x 1024; two prop atlases (below) |
| Download | 7.3 MB |

How the draw calls came down (`art/v2/tools/atlas.py`, run in the build before the per-material merge; before and after pictures of the three views in `preview/draws/`):

- Copies of one material imported twice (fire escapes, trash cans, fence posts, covered car, lamp bulb) are one material.
- Materials that are the same textures with another tint are one material, and the tint is a vertex colour (`COLOR_0`, which three.js multiplies into the base colour): the four plasters, the two bricks, the kiosk and dumpster green metal, the curb and the water tank, the alley floor and the roofs.
- `street_props`: one atlas (colour 2048, normal 1024, roughness-metal 512) for the lamp posts, hydrants, trash cans, utility boxes, manholes, chalkboard, barriers, aircon units, roller shutters, trash bags, covered car and fence posts, plus every plain-colour material (window and shop glass, shop trim, bronze, cast iron, road paint, cones, rubber, the bakery wall, the three newspaper boxes) in one cell of 64 colour squares; a plain-colour face has all its UVs on its square's centre.
- `vehicles_escapes`: the five vehicles and the two fire-escape materials in one 2048 x 1024 atlas.
- Left on their own: the ground and facade materials (they tile), the croissants (their UVs tile), the see-through and glowing materials, and the named nodes.

Triangles came down from the plain hidden sides (about 31k), the factory's front windows at a quarter of the near windows' detail (its walls keep their full shape; at a lower wall budget the window openings broke up), and fewer triangles in the vehicles (1,600, the box truck 1,200), the alley and fence props and the croissants. The facades round the square, the bank, the lamps, benches, hydrants and trash cans on the square look the same (compare `preview/` with the previous commit).

Glass in upper windows and shopfronts is opaque dark glass (reflects the environment map; it is a plain square of the `street_props` atlas). Only the bakery windows use a blended material (`clear_glass`, alpha 0.18) so its lit interior shows. No transmission anywhere.

## Named nodes the game can move or touch

| Node | What | Pivot |
|---|---|---|
| `bank_door_left`, `bank_door_right` | bronze entrance leaves, 1.5 x 3.8 m | on the hinge line (outer edge), floor of the portico; rotate about local Y. Into the lobby: left leaf positive angle, right leaf negative |
| `bakery_door` | glass shop door (group of 3 meshes: frame, handle, glass) | on its hinge (left, seen from the street); a positive angle about local Y opens it into the shop |
| `alley_gate_left`, `alley_gate_right` | iron gate leaves across the passage north of the alley, 2 m each | on the outer hinge post; away from the alley: left positive, right negative about local Y |
| `newsstand_papers` | stack of the daily paper on the kiosk counter (the top shows a front page from the sign atlas) | centre of the stack's base |

The lobby behind the bank doors is a short dark granite vestibule, so the doors can open.

## Points (empty nodes)

Seats are floor points under a seated player (add about 1.2 m for eye height; the plaza seat is on a bench whose seat top is 0.485 m above the point). A seat's forward is its local -Z.

| Point | Where, facing |
|---|---|
| `seat_plaza` | the player's bench on the plaza, facing the bank (north). Main seat |
| `seat_bank_steps` | bank-front sidewalk beside the queue, facing the door |
| `seat_bakery` | west sidewalk, 2.3 m from the bakery window, facing it |
| `seat_newsstand` | plaza, facing the kiosk counter |
| `seat_alley` | middle of the back alley, facing the gate and the factory beyond |
| `seat_factory_view` | west side street, facing the construction fence and the factory |
| `bank_queue_00` … `bank_queue_33` | the run on the bank: from the door (00) across the portico, down the steps, west along the bank front, then north up the side-street sidewalk. 0.8 m apart; each faces the next point toward the door |
| `spot_parrot_perch` | armrest of the plaza bench |
| `spot_bank_manager` | portico beside the door, facing the square |
| `spot_baker` | behind the bakery counter, facing the window |
| `bakery_counter_spot` | on the counter top |
| `newsstand_counter`, `spot_newsvendor` | kiosk counter top and the vendor inside |
| `spot_factory_gate` | factory sidewalk on the north street |

## Layout

```
                 factory (Y 76..100), chimney, water tank      skyline ring 230-430 m, fog
   ---------------------- north street -----------------------
   fence | NW row |  north block | gate | north block  | NE row | box truck
         |        |========= back alley (Y 40..46) ==========|
   west  |  W     |        SAVINGS BANK (Y 21..40)           |  E   east
   side  |  row   |   portico, steps, queue on the sidewalk  |  row side
   street|        |                                          |      street
         | bakery |   +------------- plaza ---------------+  | home loans
         |        |   | memorial, benches, newsstand       |  | diner
         |        |   +------------------------------------+  |
                         south row (cafe, closed shops)
```

Shops (all generic): bakery (lit, with awning and chalkboard), hardware, pharmacy, laundromat, a vacant shop with FOR LEASE notices, a furniture store with CLOSING SALE, diner, home loans, cafe, real estate with FOR SALE, grocery; on the south row a closed grocery and an electronics store in a closing sale. The factory's painted sign reads GEAR WORKS PLANT No. 2. Phone numbers on notices use the 555-01xx range kept for fiction.

Natural edges: a chain-link construction fence with barriers and cones across the west side street, a box truck parked across the east side street, a locked iron gate north of the alley, and buildings closing both ends of the north street.

## Light and fog (suggestions for the game)

The scene has no lights. It reads well with an environment map for reflections (for example `public/env/ombrisa_ibl.hdr`), a soft sun from the south-west and `FogExp2` around 0.006 (clear) to 0.012 (rain) in a grey-blue (#b8c0c8); the skyline towers sit 230-430 m away and are meant to fade into it. For the rainy queue, lowering roughness on `mahalle_asphalt`, `mahalle_sidewalk` and `mahalle_plaza` gives wet ground. The plasters and bricks carry their tint as a vertex colour, so a material change on them shows on every tint at once.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k asphalt_02 concrete_tiles herringbone_brick concrete_floor_worn_001 green_metal_rust white_sandstone_blocks_02 concrete_floor_02 granite_tile dark_planks
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for each Poly Haven id in `sources.json`; vehicles with `python3 art/v2/tools/sketchfab.py get "$V2_CACHE" <uid>` and `art/v2/tools/prep_model.py` (see the commands in `art/v2/tools/README.md`); textures drawn with `python3 -P art/v2/tools/textures.py "$V2_CACHE/gen"`. Then:

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/mahalle/build.py -- /tmp/mahalle_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/mahalle_raw.glb public/v2/mahalle/mahalle.glb art/v2/mahalle/pack-report.json
```

`node art/v2/tools/inspect_glb.mjs public/v2/mahalle/mahalle.glb` lists every mesh with its material and triangles. With `TAG_TRIS=1` the build prints the triangles of each building side; `PREVIEW_ONLY=side_street` renders one preview.
