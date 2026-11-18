# v2 asset tools

Shared pipeline for the v2 scenes (art/v2/<scene>/build.py). Downloads go to a cache directory outside the repo (`V2_CACHE`); only scripts, previews, reports and the packed game files are committed.

| Tool | What it does |
|---|---|
| `fetch_tex.py <cache> 1k id ...` | Poly Haven textures (diff, nor_gl, arm) into `<cache>/tex/<id>/` |
| `../../models/fetch_polyhaven.sh <id> <dir> 1k` | one Poly Haven model's glTF with its textures (existing repo script) |
| `sketchfab.py search/get <cache> ...` | Sketchfab models through the public Objaverse mirror; `get` refuses anything not CC0 or CC BY and records name, author and licence |
| `prep_model.py` | one downloaded model for Quest: decimate, scale, bake all materials into one atlas (copy of `art/models/process.py`, metals baked as dielectrics, reports next to the output) |
| `textures.py <out>` | draws the sign atlas (shop signs, notices, newspapers, street plates, awnings, bank frieze, factory sign) and the skyline window grid |
| `lib.py` | Blender helpers: PBR materials, boxes with world UVs, imports, decimation, merge by material, export, Eevee previews |
| `list_objects.py`, `thumb.py` | inspect a glTF's objects and render a quick look |
| `pack.mjs <in> <out> [report]` | KTX2 textures via basisu (UASTC normals, ETC1S colour and data), Draco geometry, dedup and prune (`npm install` here first) |
| `credits.py` | writes `art/v2/CREDITS-v2.md` from every scene's `sources.json` |
| `merge_static.mjs <in> <out> <report> --keep a,b [--split word]` | fewer draws for a packed scene: static parts with one material become one mesh, plain-colour materials become one palette material; the nodes the game finds by name (`--keep`), empties and nodes with children stay as they were; KTX2 textures kept byte for byte |
| `cut_box.mjs <in> <out> --box x0,y0,z0,x1,y1,z1 --materials a,b` | takes something out of a packed scene without rebuilding it: every triangle of those materials with all three corners inside the box (three.js world metres) goes, nothing else changes (used for the square's memorial in `mahalle.glb`, 18 Nov: `--box -1.62,0.14,-1.62,1.62,9.6,1.62 --materials bank_stone,granite`, 48 triangles; then `mahalle_merged.glb` again with the command below) |

The merged copies of the world models (18 Nov, from the files at v2 36c7017; the originals are unchanged) and the names kept for the game's lookups:

```bash
node art/v2/tools/merge_static.mjs public/v2/mahalle/mahalle.glb public/v2/mahalle/mahalle_merged.glb art/v2/mahalle/merge-report.json --keep bank_door_left,bank_door_right,spot_baker --split facade
node art/v2/tools/merge_static.mjs public/v2/sirk/sirk.glb public/v2/sirk/sirk_merged.glb art/v2/sirk/merge-report.json --keep acrobat_start_1,acrobat_start_2,acrobat_start_3,crowd_near,crowd_far,high_wire,net_line_left,net_line_right,net_rope_left,net_rope_right,rope_handle_left,rope_handle_right,safety_net,sirk_bleacher_planks,seat_ringside
node art/v2/tools/merge_static.mjs public/v2/gemi/gemi.glb public/v2/gemi/gemi_merged.glb art/v2/gemi/merge-report.json --keep sea,ship,bucket,drum,hold_water,oar,sail_rope_handle,seat_deck,ship_deck_wood
node art/v2/tools/merge_static.mjs public/v2/dag/dag.glb public/v2/dag/dag_merged.glb art/v2/dag/merge-report.json --keep climb_top,rope_1,rope_2,rope_3,hold_01,hold_02,hold_03,hold_04,hold_05,hold_06,hold_07,hold_08,hold_09,ice_hold_01,ice_hold_02,ice_hold_03,ice_hold_04,ice_hold_05,ice_hold_06
```

Primitives (one draw each per eye): city 36 → 31, circus 52 → 43, ship 23 → 19, mountain 25 → 23. Every triangle keeps its place and look (checked triangle by triangle against the originals); only zero-area triangles that Draco drops go (city: 67). The valley file is not merged: its static parts are all found by name.

Vehicles used in the neighbourhood (output in `<cache>/prep/`):

```bash
blender -b --factory-startup --python art/v2/tools/prep_model.py -- --in <cache>/sketchfab/<uid>.glb --out <cache>/prep/car_sedan.glb --name car_sedan --tris 3500 --tex 512 --scale 0.0254 --bake 512 --rough 0.35 --dark glass,void
```

Same for `car_old` (8509a7f8…, rough 0.4), `pickup` (6c48c94b…, rough 0.45), `box_truck` (3be03b6a…, 4500 tris, rough 0.5), all at scale 0.0254, and `van` (09d718c9…, 4000 tris, scale 1.0).

Python scripts that read downloads run with `python3 -P` (the script folder is not put on the import path).
