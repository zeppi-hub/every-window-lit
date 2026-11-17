"""
The game's sounds: cut, mixed to mono, levelled and encoded from CC0 Freesound recordings.

  python3 -P art/v2/tools/freesound.py get $V2_CACHE <ids from SOUNDS below>
  V2_CACHE=<cache> python3 -P art/v2/ses/make_sounds.py [name ...]

With names, only those sounds are made (and merged into sounds.json); the others stay as they are.

Writes public/v2/ses/<name>.ogg (Ogg Opus, mono, 48 kHz; Opus loops play without a gap)
and art/v2/ses/sounds.json (lengths and levels). Loops are cut a little long and their tail
is cross-faded into their head, so the end meets the start.
"""
import json
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
OUT = os.path.join(ROOT, 'public', 'v2', 'ses')
CACHE = os.path.join(os.environ['V2_CACHE'], 'freesound')
SR = 48000

# name: (freesound id, start s, length s, kind, options)
SOUNDS = {
    'rain_loop': (162190, 10.0, 16.0, 'loop', {}),
    'crowd_murmur_loop': (444900, 2.0, 14.0, 'loop', {}),
    'crowd_boo': (264378, 2.0, 4.5, 'once', {'fade_out': 1.2}),
    'applause': (656691, 0.0, 6.0, 'once', {'fade_out': 2.5}),
    'loaf_drop': (189312, 4.35, 0.8, 'once', {'fade_out': 0.25}),
    'bank_creak': (397620, 3.8, 3.0, 'once', {'rate': 0.7, 'fade_out': 0.8}),
    'fire_loop': (181563, 2.0, 12.0, 'loop', {'roar': 1.5, 'drive': 12}),
    'wind_loop': (117610, 20.0, 16.0, 'loop', {}),
    'waves_loop': (426076, 20.0, 16.0, 'loop', {}),
    'ship_creak': (218163, 1.7, 2.9, 'once', {'fade_out': 0.5}),
    'bucket_splash': (418417, 0.0, 2.5, 'once', {'fade_out': 1.0}),
    'pump_stroke': (361771, 0.0, 1.4, 'once', {'fade_out': 0.3}),
    'pump_water_loop': (588629, 6.0, 8.0, 'loop', {}),
    'clock_tick_loop': (None, 0.0, 2.0, 'loop', {'seamless': True, 'synth': 'watch'}),
    'paper': (382651, 2.6, 1.4, 'once', {'fade_out': 0.4}),
    'mic_tap': (149034, 0.0, 1.5, 'once', {'fade_out': 0.3}),
    'mic_feedback': (411441, 0.15, 2.4, 'once', {'fade_out': 0.6}),
    # Sounds of the player's own moves (second set): trimmed of silence, levelled on their
    # loudest 50 ms (EVENT) so they sit close together, peak never above PEAK.
    'feather_rustle': (688555, 0.0, 0.9, 'once', {'fade_out': 0.2, 'trim': True, 'level': 'event'}),
    'grab_soft': (494797, 0.0, 0.3, 'once', {'fade_out': 0.08, 'trim': True, 'level': 'event'}),
    'rope_creak': (254735, 3.5, 1.5, 'once', {'fade_out': 0.4, 'trim': True, 'level': 'event', 'drive': 10, 'peak': -2.5}),
    'sand_pour': (467301, 0.25, 2.4, 'once', {'fade_out': 0.6, 'trim': True, 'level': 'event', 'drive': 8}),
    'sandbag_drop': (185543, 0.15, 0.8, 'once', {'fade_out': 0.25, 'trim': True, 'level': 'event', 'drive': 6}),
    'wing_flap': (389634, 0.05, 0.6, 'once', {'fade_out': 0.15, 'trim': True, 'level': 'event'}),
    'wing_flaps': (386706, 0.1, 1.4, 'once', {'fade_out': 0.3, 'trim': True, 'level': 'event'}),
    'ear_click': (478197, 0.0, 0.12, 'once', {'fade_out': 0.03, 'trim': True, 'level': 'event', 'drive': 4}),
    'water_pour': (710550, 0.3, 3.0, 'once', {'fade_out': 0.8, 'trim': True, 'level': 'event'}),
}
XF = 1.5          # loop cross-fade, s
LOOP_RMS = -20.0  # dBFS
PEAK = -1.0       # dBFS
EVENT = -14.0     # dBFS, loudest 50 ms of a levelled one-shot


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def watch_ticks(seconds):
    """A pocket watch, made here: five light ticks a second, every other one a touch lower."""
    n = int(seconds * SR)
    x = np.zeros(n + SR)
    rng = np.random.default_rng(3)
    t = np.arange(int(0.04 * SR)) / SR
    for i in range(int(seconds * 5)):
        f0 = 3300.0 if i % 2 == 0 else 2900.0
        click = (np.sin(2 * np.pi * f0 * t) * np.exp(-t / 0.004) + 0.6 * np.sin(2 * np.pi * 1.62 * f0 * t) * np.exp(-t / 0.002)
                 + 0.35 * rng.standard_normal(len(t)) * np.exp(-t / 0.0015) + 0.25 * np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012))
        a = int(i * SR / 5)
        x[a:a + len(t)] += click * (1.0 if i % 2 == 0 else 0.8)
    return x[:n + SR]


def make(name, sid, start, length, kind, opt):
    x = watch_ticks(length) if opt.get('synth') == 'watch' else load(os.path.join(CACHE, f'{sid}.mp3'))
    rate = opt.get('rate', 1.0)
    span = (length + (XF if kind == 'loop' and not opt.get('seamless') else 0)) * rate
    a = int(start * SR)
    seg = x[a:a + int(span * SR)]
    if rate != 1.0:   # slower and lower, like a tape run slow
        n = int(len(seg) / rate)
        seg = np.interp(np.linspace(0, len(seg) - 1, n), np.arange(len(seg)), seg)
    seg = seg - seg.mean()
    if opt.get('trim'):
        # Cut the silence at both ends (the start below 35 dB, the end below 45 dB under the loudest 5 ms), keeping 5 ms before and 30 ms after.
        w = int(0.005 * SR)
        env = np.array([np.sqrt(np.mean(seg[i:i + w] ** 2)) for i in range(0, len(seg) - w + 1, w)])
        env_db = 20 * np.log10(np.maximum(env, 1e-12))
        on = np.nonzero(env_db > db(env.max()) - 45)[0]
        a0 = max(0, (np.nonzero(env_db > db(env.max()) - 35)[0][0] - 1) * w)
        a1 = min(len(seg), (on[-1] + 1) * w + int(0.03 * SR))
        seg = seg[a0:a1]
    if opt.get('roar'):
        # A low roar under the crackle (brown noise, 40-400 Hz, slowly swelling), made here.
        rng = np.random.default_rng(7)
        b = np.cumsum(rng.standard_normal(len(seg)))
        w = int(SR / 40)
        b = b - np.convolve(b, np.ones(w) / w, mode='same')
        b = np.convolve(b, np.ones(int(SR / 400)) / int(SR / 400), mode='same')
        swell = 0.75 + 0.25 * np.sin(np.linspace(0, 2 * np.pi * 3, len(seg)))
        b *= swell
        seg_rms = np.sqrt(np.mean(seg ** 2))
        seg = seg + b * (opt['roar'] * seg_rms / np.sqrt(np.mean(b ** 2)))
    if opt.get('drive'):
        # Soft limiting: raises the quiet bed, keeps the pops under the peak.
        g = 10 ** (opt['drive'] / 20) / np.abs(seg).max()
        seg = np.tanh(seg * g)
    if kind == 'loop' and not opt.get('seamless'):
        n, k = int(length * SR), int(XF * SR)
        t = np.linspace(0, np.pi / 2, k)
        head = seg[:k] * np.sin(t) + seg[n:n + k] * np.cos(t)   # tail fades into head: equal power
        seg = np.concatenate([head, seg[k:n]])
    else:
        fi = int(0.01 * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        fo = int(opt.get('fade_out', 0.05) * SR)
        if kind != 'loop':
            seg[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
    peak = np.abs(seg).max()
    rms = np.sqrt(np.mean(seg ** 2))
    gain = 10 ** ((LOOP_RMS - db(rms)) / 20) if kind == 'loop' else 10 ** ((PEAK - db(peak)) / 20)
    if opt.get('level') == 'event':
        w = int(0.05 * SR)
        loud = max(np.sqrt(np.mean(seg[i:i + w] ** 2)) for i in range(0, max(1, len(seg) - w + 1), w // 2))
        gain = 10 ** ((EVENT - db(loud)) / 20)
    gain = min(gain, 10 ** ((opt.get('peak', PEAK) - db(peak)) / 20))
    seg = (seg * gain).astype(np.float32)
    path = os.path.join(OUT, f'{name}.ogg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libopus', '-b:a', '48k' if kind == 'loop' else '64k', '-application', 'audio', path],
                   input=seg.tobytes(), check=True)
    return {'file': f'public/v2/ses/{name}.ogg', 'seconds': round(len(seg) / SR, 2), 'loop': kind == 'loop',
            'peak_dbfs': round(float(db(np.abs(seg).max())), 1), 'rms_dbfs': round(float(db(np.sqrt(np.mean(seg.astype(np.float64) ** 2)))), 1),
            'bytes': os.path.getsize(path), 'freesound': sid}


if __name__ == '__main__':
    import sys
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(SOUNDS)
    path = os.path.join(HERE, 'sounds.json')
    info = json.load(open(path)) if sys.argv[1:] and os.path.exists(path) else {}
    for name in names:
        info[name] = make(name, *SOUNDS[name])
    info = {k: info[k] for k in SOUNDS if k in info}
    json.dump(info, open(path, 'w'), indent=1)
    total = sum(v['bytes'] for v in info.values())
    for k, v in info.items():
        print(f"{k:20} {v['seconds']:5.2f}s {'loop' if v['loop'] else 'once'} peak {v['peak_dbfs']:5.1f} rms {v['rms_dbfs']:5.1f} {v['bytes'] / 1024:6.1f} KB")
    print(f'total {total / 1e6:.2f} MB')
