"""Downloads Poly Haven textures (diff, nor_gl, arm as JPG) into <cache>/tex/<id>/.
  python3 art/v2/tools/fetch_tex.py <cache_dir> <res 1k|2k> id [id ...]
"""
import json, os, sys, urllib.request
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'asset-fetch/1.0')]
urllib.request.install_opener(opener)
cache, res, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
for i in ids:
    out = os.path.join(cache, 'tex', i)
    os.makedirs(out, exist_ok=True)
    files = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{i}'))
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')):
        if key not in files:
            print(i, 'missing', key); continue
        url = files[key][res]['jpg']['url']
        p = os.path.join(out, name + '.jpg')
        if not os.path.exists(p):
            urllib.request.urlretrieve(url, p)
    print(i, sorted(os.listdir(out)))
