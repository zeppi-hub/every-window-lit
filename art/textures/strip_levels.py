# Drops the top mip level(s) of a 2D KTX2 file without re-encoding, so the
# smaller file's levels are bit-identical to the larger file's lower mips.
#   python3 -I art/textures/strip_levels.py <in.ktx2> <out.ktx2> <levels to drop>
# Used for the town scans that stream in after Enter VR (materials.ts): the
# stand-in shows exactly what the full texture shows from the tower, where
# the GPU never samples its top level(s). Handles UASTC with Zstandard
# (levels are independent) and ETC1S/BasisLZ (one image description per
# level in the global data, level 0 first).
import struct
import sys

src, dst, drop = sys.argv[1], sys.argv[2], int(sys.argv[3])
d = open(src, 'rb').read()
vk, ts, w, h, depth, layers, faces, levels, scheme = struct.unpack('<9I', d[12:48])
assert depth == 0 and layers == 0 and faces == 1, 'only plain 2D textures'
assert 0 < drop < levels, f'{src}: has {levels} levels, cannot drop {drop}'
dfd_o, dfd_l, kvd_o, kvd_l, sgd_o, sgd_l = struct.unpack('<IIIIQQ', d[48:80])
index = [struct.unpack('<QQQ', d[80 + 24 * i:104 + 24 * i]) for i in range(levels)]
dfd, kvd, sgd = d[dfd_o:dfd_o + dfd_l], d[kvd_o:kvd_o + kvd_l], d[sgd_o:sgd_o + sgd_l]
if scheme == 1:
    head, rest = sgd[:20], sgd[20 + 20 * levels:]
    descs = sgd[20:20 + 20 * levels]
    sgd = head + descs[20 * drop:] + rest
else:
    assert sgd_l == 0, 'unexpected global data'
kept = index[drop:]
# Unsupercompressed levels sit on 16-byte boundaries (UASTC/ASTC blocks); supercompressed ones need none.
step = 16 if scheme == 0 else 1


def align(x, a):
    return (x + a - 1) // a * a


o = 80 + 24 * len(kept)
n_dfd = o
o += len(dfd)
n_kvd = o if kvd else 0
o += len(kvd)
n_sgd = align(o, 8) if sgd else 0
o = n_sgd + len(sgd) if sgd else o
# Level data keeps its order in the file: smallest level first.
placed = {}
for i in sorted(range(len(kept)), key=lambda i: kept[i][0]):
    o = align(o, step)
    placed[i] = o
    o += kept[i][1]
out = bytearray(d[:12])
out += struct.pack('<9I', vk, ts, max(1, w >> drop), max(1, h >> drop), depth, layers, faces, len(kept), scheme)
out += struct.pack('<IIIIQQ', n_dfd, len(dfd), n_kvd, len(kvd), n_sgd, len(sgd))
for i, (_, length, full) in enumerate(kept):
    out += struct.pack('<QQQ', placed[i], length, full)
out += dfd + kvd
if sgd:
    out += b'\0' * (n_sgd - len(out)) + sgd
for i in sorted(placed, key=placed.get):
    out += b'\0' * (placed[i] - len(out)) + d[kept[i][0]:kept[i][0] + kept[i][1]]
open(dst, 'wb').write(out)
print(f'{dst}: {len(d)} -> {len(out)} bytes, {levels} -> {len(kept)} levels')
