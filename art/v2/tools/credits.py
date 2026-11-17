"""Writes art/v2/CREDITS-v2.md from every art/v2/<scene>/sources.json.
Poly Haven authors come from its public API (cached in tools/polyhaven_authors.json).
  python3 -P art/v2/tools/credits.py
"""
import glob, json, os, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.dirname(HERE)
cache_path = os.path.join(HERE, 'polyhaven_authors.json')
cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'asset-credits/1.0')]


def ph(i):
    if i not in cache:
        info = json.load(opener.open(f'https://api.polyhaven.com/info/{i}'))
        cache[i] = {'name': info.get('name', i), 'authors': sorted(info.get('authors', {}).keys())}
    return cache[i]


scenes = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(V2, '*', 'sources.json')))]
order = ['mahalle', 'ofis', 'sirk', 'gemi', 'ciftlik', 'dag', 'yangin', 'buzul']
scenes.sort(key=lambda s: order.index(s['scene']) if s['scene'] in order else 99)
out = ['# Credits for the v2 scenes', '',
       'Every asset below is CC0 or CC BY and may be redistributed in this public repository. CC BY works are credited by title, author, licence and link; the changes made are listed per scene. Game files are in public/v2/<scene>/, build scripts and previews in art/v2/<scene>/.', '',
       'Licences: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), Poly Haven licence = CC0 (https://polyhaven.com/license).', '',
       'Changes common to all scenes: models reduced to fewer triangles (Blender decimation), textures scaled down and re-encoded as KTX2 (basisu), geometry Draco-compressed, pieces placed, recoloured and merged by material in art/v2/<scene>/build.py.', '']
for s in scenes:
    out += [f"## {s['title']} ({s['scene']})", '']
    if s.get('polyhaven_models'):
        out.append('Models from Poly Haven, CC0:')
        for i in s['polyhaven_models']:
            d = ph(i)
            out.append(f"- {d['name']} by {', '.join(d['authors'])}: https://polyhaven.com/a/{i}")
        out.append('')
    if s.get('polyhaven_textures'):
        out.append('Textures from Poly Haven, CC0:')
        for i in s['polyhaven_textures']:
            d = ph(i)
            out.append(f"- {d['name']} by {', '.join(d['authors'])}: https://polyhaven.com/a/{i}")
        out.append('')
    if s.get('polyhaven_hdris'):
        out.append('Sky from Poly Haven, CC0:')
        for i in s['polyhaven_hdris']:
            d = ph(i)
            out.append(f"- {d['name']} by {', '.join(d['authors'])}: https://polyhaven.com/a/{i}")
        out.append('')
    for key, label in (('sketchfab', 'Models from Sketchfab (downloaded through the Objaverse mirror, https://huggingface.co/datasets/allenai/objaverse, ODC-By 1.0 for the collection; each model keeps its own licence)'),
                       ('other', 'Other sources')):
        if s.get(key):
            out.append(label + ':')
            for m in s[key]:
                out.append(f"- \"{m['name']}\" by {m['author']}, {m['licence']}: {m['page']} ({m['use']}; {m.get('changes', 'reduced in triangles, all materials baked into one colour texture')})" if key == 'sketchfab'
                           else f"- {m['name']} by {m['author']}, {m['licence']}: {m['page']} ({m['use']})")
            out.append('')
    if s.get('sounds'):
        out.append('Sounds (Freesound, CC0):')
        for m in s['sounds']:
            out.append(f"- \"{m['name']}\" by {m['author']}: {m['page']} ({m['use']})")
        out.append('')
    if s.get('made_here'):
        out += ['Made for this game: ' + s['made_here'], '']
out += ['## Tools', '', 'Sign and print textures use DejaVu Sans Condensed Bold and DejaVu Serif Bold (Bitstream Vera licence with DejaVu changes) and Liberation Sans Narrow Bold (SIL Open Font License 1.1); see art/v2/tools/fonts/README.md. The fonts are not shipped to the game.', '']
json.dump(cache, open(cache_path, 'w'), indent=1, sort_keys=True)
open(os.path.join(V2, 'CREDITS-v2.md'), 'w').write('\n'.join(out))
print('wrote CREDITS-v2.md for', [s['scene'] for s in scenes])
