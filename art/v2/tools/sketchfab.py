"""Sketchfab models through the public Objaverse mirror (no login).
  python3 art/v2/tools/sketchfab.py search <cache> "<query>" [by|cc0] [max_faces]
  python3 art/v2/tools/sketchfab.py get <cache> <uid> [<uid> ...]
`get` reads the licence, author and name from the Sketchfab API, refuses anything
that is not CC0 or CC BY, downloads the GLB from the Objaverse mirror into
<cache>/sketchfab/<uid>.glb and appends the record to <cache>/sketchfab/records.json.
"""
import gzip, json, os, sys, urllib.parse, urllib.request
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'asset-fetch/1.0')]
urllib.request.install_opener(opener)
MIRROR = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/'
cmd, cache = sys.argv[1], sys.argv[2]
d = os.path.join(cache, 'sketchfab')
os.makedirs(d, exist_ok=True)

def paths():
    p = os.path.join(cache, 'object-paths.json.gz')
    if not os.path.exists(p):
        urllib.request.urlretrieve(MIRROR + 'object-paths.json.gz', p)
    return json.load(gzip.open(p))

if cmd == 'search':
    q = sys.argv[3]
    lic = sys.argv[4] if len(sys.argv) > 4 else 'by'
    mf = sys.argv[5] if len(sys.argv) > 5 else '40000'
    url = ('https://api.sketchfab.com/v3/search?type=models&downloadable=true&sort_by=-likeCount&count=24'
           f'&q={urllib.parse.quote(q)}&license={lic}&max_face_count={mf}')
    r = json.load(urllib.request.urlopen(url))
    p = paths()
    for m in r['results']:
        print(m['uid'], m['faceCount'], 'MIRROR' if m['uid'] in p else '-', '|', m['name'][:55], '|', m['user']['username'])
elif cmd == 'get':
    p = paths()
    rec_path = os.path.join(d, 'records.json')
    recs = json.load(open(rec_path)) if os.path.exists(rec_path) else {}
    for uid in sys.argv[3:]:
        m = json.load(urllib.request.urlopen(f'https://api.sketchfab.com/v3/models/{uid}'))
        lic = (m.get('license') or {}).get('label', '')
        if lic not in ('CC Attribution', 'CC0 Public Domain'):
            print(uid, 'REFUSED licence', lic); continue
        if uid not in p:
            print(uid, 'not in mirror'); continue
        out = os.path.join(d, uid + '.glb')
        if not os.path.exists(out):
            urllib.request.urlretrieve(MIRROR + p[uid], out)
        recs[uid] = {'name': m['name'], 'author': m['user']['displayName'], 'username': m['user']['username'],
                     'licence': lic, 'page': m['viewerUrl'], 'faces': m.get('faceCount'), 'file': os.path.basename(out)}
        print(uid, lic, '|', m['name'], '|', m['user']['displayName'], os.path.getsize(out))
    json.dump(recs, open(rec_path, 'w'), indent=1)
