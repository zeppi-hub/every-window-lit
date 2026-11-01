#!/bin/bash
# Shrinks the prepared models in public/models in place, with no visible
# change. Run from the repository root after process.py:
#   bash art/models/compress.sh
#
# 1) The lantern's glass material loses its textures (the app draws its own
#    glass on the globe's geometry, tocco.ts), and the unused images go.
# 2) Normals and UVs are stored as normalized integers (KHR_mesh_quantization,
#    10-bit normals, 12-bit UVs; three.js reads them natively): normals move
#    by under half a degree, UVs by about a tenth of a texel. Positions stay
#    float, so node transforms and the code that clones, scales or places
#    the geometry are unchanged. The townsfolk are left alone: their
#    skinned vertices are baked into animation textures (crowd.ts).
# GitHub Pages gzips .glb, so the saving shows as transferred bytes.
set -euo pipefail
HERE=$(dirname "$0")
GT="npx --yes @gltf-transform/cli@4.5.1"
QUANTIZED="basket bench bicycle car_a car_b car_c fountain2 lantern tower_key"

python3 -I "$HERE/gltf_fix.py" untexture public/models/lantern.glb glass
$GT prune public/models/lantern.glb public/models/lantern.glb --keep-leaves true --keep-attributes true --keep-indices true --keep-solid-textures true
for name in $QUANTIZED; do
  file=public/models/$name.glb
  $GT quantize "$file" "$file" --pattern '+(NORMAL|TEXCOORD_0)' --vertex-layout separate
  python3 -I "$HERE/gltf_fix.py" declare-quantization "$file"
done
for name in $QUANTIZED; do $GT validate "public/models/$name.glb" | grep -E 'Errors|errors' || true; done
