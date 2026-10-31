#!/bin/bash
# Downloads one Poly Haven model's glTF (1k textures by default) with its
# .bin and textures into a new directory, keeping the relative layout.
#   bash art/models/fetch_polyhaven.sh <asset_id> <out_dir> [1k|2k]
set -euo pipefail
ID=${1:?asset id}
OUT=${2:?out dir}
RES=${3:-1k}
mkdir -p "$OUT"
curl -sf "https://api.polyhaven.com/files/$ID" -o "$OUT/files.json"
python3 - "$OUT" "$RES" <<'PY'
import json, os, sys, urllib.request
out, res = sys.argv[1], sys.argv[2]
g = json.load(open(os.path.join(out, 'files.json')))['gltf'][res]['gltf']
jobs = [(os.path.basename(g['url']), g['url'])] + [(k, v['url']) for k, v in g.get('include', {}).items()]
for rel, url in jobs:
    path = os.path.join(out, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    urllib.request.urlretrieve(url, path)
    print(rel, os.path.getsize(path))
PY
