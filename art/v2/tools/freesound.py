"""CC0 sounds from Freesound without an account (public search pages and preview files).
  python3 -P art/v2/tools/freesound.py search <cache> "<query>" [max_seconds]
  python3 -P art/v2/tools/freesound.py get <cache> <id> [<id> ...]
`search` lists CC0 results only (id, seconds, downloads, author, title).
`get` reads the sound's page, refuses it unless the licence is CC0 1.0, downloads the
high-quality preview (MP3, 128 kbps) into <cache>/freesound/<id>.mp3 and appends
the record (title, author, page, licence) to <cache>/freesound/records.json.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = {'User-Agent': 'asset-fetch/1.0'}
CC0 = 'creativecommons.org/publicdomain/zero/1.0'


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def results(page):
    out = []
    for m in re.finditer(r'data-sound-id="(\d+)"\s+data-username="([^"]*)".*?data-mp3="([^"]*)".*?'
                         r'data-title="([^"]*)"\s+data-duration="([\d.]+)".*?data-num-downloads="(\d+)"', page, re.S):
        sid, user, mp3, title, dur, dl = m.groups()
        out.append({'id': int(sid), 'author': html.unescape(user), 'title': html.unescape(title),
                    'seconds': float(dur), 'downloads': int(dl), 'preview': mp3.replace('-lq.mp3', '-hq.mp3')})
    return out


cmd, cache = sys.argv[1], sys.argv[2]
d = os.path.join(cache, 'freesound')
os.makedirs(d, exist_ok=True)
if cmd == 'search':
    q = sys.argv[3]
    mx = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
    url = ('https://freesound.org/search/?' + urllib.parse.urlencode(
        {'q': q, 'f': 'license:"Creative Commons 0"'}))
    page = fetch(url).decode('utf-8', 'replace')
    for r in results(page):
        if r['seconds'] <= mx:
            print(f"{r['id']:>8} {r['seconds']:7.1f}s {r['downloads']:>7} dl  {r['author']}: {r['title']}")
elif cmd == 'get':
    rec_path = os.path.join(d, 'records.json')
    recs = json.load(open(rec_path)) if os.path.exists(rec_path) else {}
    for sid in sys.argv[3:]:
        page = fetch(f'https://freesound.org/s/{sid}/').decode('utf-8', 'replace')
        lic = set(re.findall(r'creativecommons\.org/[a-z/0-9.]+', page))
        if not lic or any(CC0 not in l for l in lic):
            print(sid, 'REFUSED, licence', lic)
            continue
        title = html.unescape(re.search(r'<title>Freesound - (.*?) by ([^<]*)</title>', page).group(1))
        author = html.unescape(re.search(r'<title>Freesound - (.*?) by ([^<]*)</title>', page).group(2))
        r = [x for x in results(page) if x['id'] == int(sid)]
        prev = r[0]['preview'] if r else re.search(r'https://cdn\.freesound\.org/previews/\d+/' + sid + r'_\d+-hq\.mp3', page).group(0)
        open(os.path.join(d, f'{sid}.mp3'), 'wb').write(fetch(prev))
        recs[sid] = {'title': title, 'author': author, 'licence': 'CC0 1.0',
                     'page': f'https://freesound.org/s/{sid}/', 'file': f'{sid}.mp3'}
        print(sid, 'ok', author, '-', title)
    json.dump(recs, open(rec_path, 'w'), indent=1)
