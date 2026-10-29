#!/bin/bash
# Encodes the Poly Haven scans and the far-town panorama to KTX2 for Quest.
# Needs basisu (Homebrew basis_universal 2.50). Run from the repository root:
#   bash art/textures/encode_ktx2.sh art/textures/source <panorama png>
#
# Only formats three.js's KTX2Loader transcodes are used: UASTC LDR 4x4
# (becomes ASTC 4x4 on Quest) for close-up detail, ETC1S (becomes ETC2) for
# everything seen from a distance. -y_flip because compressed textures are
# not flipped on upload; it keeps the same orientation as the JPEGs.
set -euo pipefail
SRC=${1:?source texture dir}
PANO=${2:?panorama png}
OUT=public/textures
NEAR="medieval_blocks_02 terracotta_floor_tiles roof_planks large_sandstone_blocks_01 wood_shutter painted_plaster_wall cobblestone_floor_08 red_brick_03 white_sandstone_blocks_02 concrete_floor_02"
FAR="roof_09"
B="nice -n 15 basisu -ktx2 -mipmap -y_flip"

for id in $NEAR; do
  mkdir -p "$OUT/$id"
  $B -uastc -uastc_level 2 -uastc_rdo_l 1.0 "$SRC/$id/diff.jpg" -output_file "$OUT/$id/diff.ktx2"
  $B -uastc -uastc_level 2 -uastc_rdo_l 0.5 -linear -normal_map "$SRC/$id/nor.jpg" -output_file "$OUT/$id/nor.ktx2"
  $B -linear -q 128 -comp_level 2 "$SRC/$id/rough.jpg" -output_file "$OUT/$id/rough.ktx2"
done
for id in $FAR; do
  mkdir -p "$OUT/$id"
  sips -Z 512 "$SRC/$id/diff.jpg" --out "/tmp/ewl_${id}_512.jpg" >/dev/null
  $B -q 192 -comp_level 2 "/tmp/ewl_${id}_512.jpg" -output_file "$OUT/$id/diff.ktx2"
  rm -f "/tmp/ewl_${id}_512.jpg"
done
$B -q 192 -comp_level 2 "$PANO" -output_file public/env/ombrisa_sky.ktx2
