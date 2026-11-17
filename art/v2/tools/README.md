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

Vehicles used in the neighbourhood (output in `<cache>/prep/`):

```bash
blender -b --factory-startup --python art/v2/tools/prep_model.py -- --in <cache>/sketchfab/<uid>.glb --out <cache>/prep/car_sedan.glb --name car_sedan --tris 3500 --tex 512 --scale 0.0254 --bake 512 --rough 0.35 --dark glass,void
```

Same for `car_old` (8509a7f8…, rough 0.4), `pickup` (6c48c94b…, rough 0.45), `box_truck` (3be03b6a…, 4500 tris, rough 0.5), all at scale 0.0254, and `van` (09d718c9…, 4000 tris, scale 1.0).

Python scripts that read downloads run with `python3 -P` (the script folder is not put on the import path).
