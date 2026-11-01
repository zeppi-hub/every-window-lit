#!/bin/bash
# Encodes the Poly Haven scans and the far-town panorama to KTX2 for Quest.
# Needs basisu (Homebrew basis_universal 2.50) and python3. Run from the
# repository root:
#   bash art/textures/encode_ktx2.sh art/textures/source <panorama png>
#
# Only formats three.js's KTX2Loader transcodes are used: UASTC LDR 4x4
# (becomes ASTC 4x4 on Quest) for close-up detail, ETC1S (becomes ETC2) for
# everything seen from a distance. -y_flip because compressed textures are
# not flipped on upload; it keeps the same orientation as the JPEGs.
# Zstandard level 22 packs the same UASTC blocks about 4% tighter (lossless).
#
# Every scan is encoded at 1024 with mipmaps. A map that does not need its
# top level ships with it stripped (strip_levels.py), so what remains is
# bit-identical to the full file's lower mips: normal and roughness maps of
# surfaces whose relief or gloss is too faint to show the finest octave.
# The town-only scans (brick, paving) also get a smaller "_first" copy that
# is loaded before Enter VR; the full files stream in afterwards
# (materials.ts STREAMED).
set -euo pipefail
SRC=${1:?source texture dir}
PANO=${2:?panorama png}
OUT=public/textures
HERE=$(dirname "$0")
# id, then the top level kept for its normal and roughness maps (albedo always keeps 1024).
NEAR="terracotta_floor_tiles 512 256
roof_planks 512 256
large_sandstone_blocks_01 1024 256
wood_shutter 1024 256
painted_plaster_wall 1024 256
cobblestone_floor_08 1024 1024
red_brick_03 1024 512
white_sandstone_blocks_02 512 256
concrete_floor_02 1024 256"
# Town-only scans: levels dropped from every map for the copy loaded before Enter VR (see materials.ts).
FIRST="red_brick_03 2
cobblestone_floor_08 1"
FAR="roof_09"
B="nice -n 15 basisu -ktx2 -mipmap -y_flip"
Z="-ktx2_zstandard_level 22"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Copies a full 1024 file, or strips it down to the given top level.
install() {
  local from=$1 to=$2 top=$3 drop=0 size=1024
  while [ "$size" -gt "$top" ]; do size=$((size / 2)); drop=$((drop + 1)); done
  if [ "$drop" -eq 0 ]; then cp "$from" "$to"; else python3 -I "$HERE/strip_levels.py" "$from" "$to" "$drop"; fi
}

while read -r id nor rough; do
  mkdir -p "$OUT/$id" "$TMP/$id"
  $B -uastc -uastc_level 2 -uastc_rdo_l 1.0 $Z "$SRC/$id/diff.jpg" -output_file "$TMP/$id/diff.ktx2"
  $B -uastc -uastc_level 2 -uastc_rdo_l 0.5 $Z -linear -normal_map "$SRC/$id/nor.jpg" -output_file "$TMP/$id/nor.ktx2"
  $B -linear -q 128 -comp_level 2 "$SRC/$id/rough.jpg" -output_file "$TMP/$id/rough.ktx2"
  install "$TMP/$id/diff.ktx2" "$OUT/$id/diff.ktx2" 1024
  install "$TMP/$id/nor.ktx2" "$OUT/$id/nor.ktx2" "$nor"
  install "$TMP/$id/rough.ktx2" "$OUT/$id/rough.ktx2" "$rough"
done <<< "$NEAR"
while read -r id drop; do
  for map in diff nor rough; do
    python3 -I "$HERE/strip_levels.py" "$TMP/$id/$map.ktx2" "$OUT/$id/${map}_first.ktx2" "$drop"
  done
done <<< "$FIRST"
for id in $FAR; do
  mkdir -p "$OUT/$id"
  sips -Z 512 "$SRC/$id/diff.jpg" --out "$TMP/${id}_512.jpg" >/dev/null
  $B -q 192 -comp_level 2 "$TMP/${id}_512.jpg" -output_file "$OUT/$id/diff.ktx2"
done
$B -q 192 -comp_level 2 "$PANO" -output_file public/env/ombrisa_sky.ktx2
