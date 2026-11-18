#!/bin/bash
# Three tiling Poly Haven scans (CC0) for Repeat After Me, in public/v2/doku/<id>/:
#   rustic_stone_wall  stone courses, 1.52 m square   (the cold fire's wall, forest)
#   weathered_planks   upright planks, 2.0 m square   (the same wall in wood, if wanted)
#   marble_01          pale stone floor slabs, 1.5 m square (the bank hall, S07)
# Each has diff, nor (OpenGL normals) and rough, 1024 px:
#   *.ktx2  for KTX2Loader (the game's decoders/basis). diff and nor UASTC (ASTC on Quest),
#           rough ETC1S; all with mipmaps. Stored upside down (-y_flip) as public/textures is,
#           so they sit the same way as the JPGs with three.js's default flipY.
#   *.jpg   the same pictures for a plain TextureLoader (rough at 512).
# diff is sRGB; nor and rough are linear. Set repeat to (metres across / the size above).
#
#   bash art/v2/doku/encode.sh <cache>   (after: python3 art/v2/tools/fetch_tex.py <cache> 1k <ids>,
#   and each id's Rough 1k JPG saved as <cache>/tex/<id>/rough.jpg)
set -euo pipefail
C=${1:?cache dir}
OUT=public/v2/doku
TOOLS=$(cd "$(dirname "$0")/../tools" && pwd)
b() { nice -n 20 basisu -ktx2 -mipmap -y_flip "$@" >/dev/null; }
for id in rustic_stone_wall weathered_planks marble_01; do
  T=$C/tex/$id
  mkdir -p "$OUT/$id"
  node -e "
    const sharp = require('$TOOLS/node_modules/sharp');
    (async () => {
      await sharp('$T/rough.jpg').greyscale().png().toFile('$T/rough.png');
      for (const m of ['diff', 'nor']) await sharp('$T/' + m + '.jpg').png().toFile('$T/' + m + '.png');
      await sharp('$T/diff.png').jpeg({ quality: 80, mozjpeg: true }).toFile('$OUT/$id/diff.jpg');
      await sharp('$T/nor.png').jpeg({ quality: 88, mozjpeg: true }).toFile('$OUT/$id/nor.jpg');
      await sharp('$T/rough.png').resize(512, 512).jpeg({ quality: 80, mozjpeg: true }).toFile('$OUT/$id/rough.jpg');
    })();"
  b -uastc -uastc_level 2 -uastc_rdo_l 1.0 -ktx2_zstandard_level 22 "$T/diff.png" -output_file "$OUT/$id/diff.ktx2"
  b -uastc -uastc_level 2 -uastc_rdo_l 0.5 -ktx2_zstandard_level 22 -linear -normal_map "$T/nor.png" -output_file "$OUT/$id/nor.ktx2"
  b -linear -q 128 -comp_level 2 "$T/rough.png" -output_file "$OUT/$id/rough.ktx2"
done
