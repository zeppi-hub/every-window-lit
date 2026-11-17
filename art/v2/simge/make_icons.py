"""
The word icons: one plain picture per word, the same everywhere (orb, feather, Gray's word
balloon, policy card, notebook, credits). Writes, for every word:

  art/v2/simge/svg/<word>.svg          one colour (currentColor, ink by default), 256 x 256
  art/v2/simge/svg/<word>_badge.svg    ink picture on a cream disc with an ink ring

and an HTML page used to rasterise them (see README). Run with python3 -P.
Shapes are bold and few, so they still read across the square.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'svg')
INK = '#2a2420'
CREAM = '#f3ecdc'

W = 14   # main line width (of 256)
w = 9    # secondary line width


def f(*xs):
    return ' '.join(f'{x:.1f}' if isinstance(x, float) else str(x) for x in xs)


def poly(pts):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'


def line(x0, y0, x1, y1, width=W):
    return f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke-width="{width}"/>'


def ring(cx, cy, r, width=W):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke-width="{width}"/>'


def cut(mask_id, body, holes):
    """body drawn with holes cut out (holes: black shapes in a mask)."""
    return (f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">'
            f'<rect width="256" height="256" fill="#fff"/><g fill="#000" stroke="#000">{holes}</g></mask>'
            f'<g mask="url(#{mask_id})">{body}</g>')


def safety_net():
    top = 'M36,84 Q128,118 220,84'
    bottom = 'M36,84 Q128,212 220,84'
    region = 'M36,84 Q128,118 220,84 Q128,212 36,84 Z'
    mesh = ''.join(line(x, 40, x + 160, 200, 7) + line(x + 160, 40, x, 200, 7) for x in range(-150, 260, 30))
    return (f'<clipPath id="netc"><path d="{region}"/></clipPath>'
            f'<g clip-path="url(#netc)">{mesh}</g>'
            f'<path d="{top}" fill="none" stroke-width="{w}"/><path d="{bottom}" fill="none" stroke-width="{W}"/>'
            + line(36, 54, 36, 214) + line(220, 54, 220, 214))


def firewall():
    flame = ('M128,14 C140,42 166,56 174,86 C180,108 176,124 170,136 L86,136 C80,124 76,108 82,88 '
             'C88,70 100,62 104,44 C114,58 116,70 116,80 C124,64 132,44 128,14 Z')
    lick_l = 'M66,74 C58,92 50,110 58,128 L76,134 C70,116 70,96 66,74 Z'
    lick_r = 'M192,66 C204,88 210,110 198,130 L180,134 C188,112 190,90 192,66 Z'
    hole = 'M128,72 C138,90 150,100 148,118 C146,128 138,134 128,134 C118,134 110,128 108,118 C106,104 120,96 128,72 Z'
    rows = [(132, 160), (165, 194), (199, 228)]
    bricks = []
    for i, (y0, y1) in enumerate(rows):
        x = 28 - (34 if i % 2 else 0)
        while x < 228:
            bricks.append(f'<rect x="{max(x, 28)}" y="{y0}" width="{min(x + 62, 228) - max(x, 28)}" height="{y1 - y0}" rx="3"/>')
            x += 67
    flame_g = cut('fwm', f'<path d="{flame}"/><path d="{lick_l}"/><path d="{lick_r}"/>',
                  f'<path d="{hole}"/><rect x="20" y="124" width="216" height="112"/>')
    return flame_g + ''.join(bricks)


def bail_out():
    body = 'M58,92 L182,92 L166,198 Q164,206 156,206 L84,206 Q76,206 74,198 Z'
    hoops = line(40, 128, 200, 128, 7) + line(40, 170, 200, 170, 7)
    bucket = (cut('bom', f'<path d="{body}"/>', hoops)
              + line(50, 90, 190, 90, W)
              + f'<path d="M62,92 Q120,-6 178,92" fill="none" stroke-width="{w}"/>')
    drops = ''.join(f'<path d="M{x},{y} C{x + 9},{y + 14} {x + 11},{y + 20} {x},{y + 26} C{x - 11},{y + 20} {x - 9},{y + 14} {x},{y} Z"/>'
                    for x, y in ((196, 132), (214, 174), (186, 194)))
    splash = f'<path d="M188,74 Q222,84 226,120" fill="none" stroke-width="{w}"/>'
    return f'<g transform="rotate(32 120 140) translate(-8 6)">{bucket}</g>' + splash + drops


def stress_test():
    bell = ('M128,108 C100,108 90,130 88,158 C86,184 78,196 62,204 L194,204 '
            'C178,196 170,184 168,158 C166,130 156,108 128,108 Z')
    rope_body = '<rect x="118" y="26" width="20" height="86" rx="4"/>'
    twists = ''.join(line(110, y, 146, y - 14, 5) for y in range(40, 124, 14))
    return (line(70, 22, 186, 22, W)
            + cut('stm', rope_body, twists)
            + f'<path d="{bell}"/>' + '<circle cx="128" cy="218" r="12"/>'
            + f'<path d="M206,134 Q218,156 206,178" fill="none" stroke-width="{w}"/>'
            + f'<path d="M224,122 Q242,156 224,190" fill="none" stroke-width="{w}"/>'
            + f'<path d="M50,134 Q38,156 50,178" fill="none" stroke-width="{w}"/>'
            + f'<path d="M32,122 Q14,156 32,190" fill="none" stroke-width="{w}"/>')


def prime_the_pump():
    body = '<path d="M106,100 L150,100 L156,206 L100,206 Z"/>'
    cap = '<rect x="94" y="84" width="68" height="20" rx="5"/>'
    base = '<rect x="78" y="204" width="100" height="18" rx="5"/>'
    spout = '<path d="M108,114 L54,122 Q44,124 44,134 L44,144 L62,144 L62,138 L108,136 Z"/>'
    handle = line(150, 86, 228, 38, W) + '<circle cx="228" cy="38" r="11"/>'
    rod = line(128, 86, 128, 58, w) + line(120, 60, 156, 52, w)
    drop = '<path d="M53,160 C62,174 64,180 53,188 C42,180 44,174 53,160 Z"/>'
    return body + cap + base + spout + handle + rod + drop


def ring_fence():
    cx, cy, rx, ry, rail = 128, 158, 100, 58, 26
    def picket(a, h, wd):
        x = cx + rx * math.cos(a)
        y = cy + ry * math.sin(a)
        return poly([(x - wd / 2, y + 6), (x - wd / 2, y - h), (x, y - h - 11), (x + wd / 2, y - h), (x + wd / 2, y + 6)])
    angles = [math.radians(18 + 36 * k) for k in range(10)]
    back = [picket(a, 44, 12) for a in angles if math.sin(a) < -0.05]
    side = [picket(a, 50, 14) for a in angles if -0.05 <= math.sin(a) < 0.5]
    front = [picket(a, 56, 17) for a in angles if math.sin(a) >= 0.5]
    def arc(y, sweep, width):
        return f'<path d="M{cx - rx},{y} A{rx},{ry} 0 0 {sweep} {cx + rx},{y}" fill="none" stroke-width="{width}"/>'
    rails_back = arc(cy - rail, 1, w) + arc(cy - 2 * rail + 6, 1, w)
    rails_front = arc(cy - rail, 0, w + 1) + arc(cy - 2 * rail + 6, 0, w + 1)
    def halo(paths, width):
        return ''.join(f'<path d="{p}" stroke-width="{width}" stroke-linejoin="round"/>' for p in paths)
    layer_back = cut('rfa', ''.join(f'<path d="{p}"/>' for p in back) + rails_back,
                     halo(side + front, 12) + rails_front.replace(f'stroke-width="{w + 1}"', 'stroke-width="22"'))
    layer_side = cut('rfb', ''.join(f'<path d="{p}"/>' for p in side), halo(front, 12)
                     + rails_front.replace(f'stroke-width="{w + 1}"', 'stroke-width="22"'))
    layer_rails = cut('rfc', rails_front, halo(front, 12))
    return layer_back + layer_side + layer_rails + ''.join(f'<path d="{p}"/>' for p in front)


def haircut():
    def blade(x0, y0, x1, y1, w0, w1):
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy)
        nx, ny = -dy / n, dx / n
        return poly([(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
                     (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)])
    body = (f'<path d="{blade(104, 166, 192, 26, 24, 3)}"/>' + f'<path d="{blade(152, 166, 64, 26, 24, 3)}"/>'
            + line(98, 174, 116, 152, 16) + line(158, 174, 140, 152, 16)
            + ring(80, 194, 25) + ring(176, 194, 25))
    return cut('hcm', body, '<circle cx="128" cy="141" r="6"/>')


def clawback():
    pad = 'M128,128 C160,128 192,160 192,188 C192,212 170,220 152,214 C140,210 134,206 128,206 C122,206 116,210 104,214 C86,220 64,212 64,188 C64,160 96,128 128,128 Z'
    toes = [(70, 118, -28), (104, 80, -10), (152, 80, 10), (186, 118, 28)]
    out = f'<path d="{pad}"/>'
    for x, y, r in toes:
        out += f'<ellipse cx="{x}" cy="{y}" rx="19" ry="25" transform="rotate({r} {x} {y})"/>'
        a = math.radians(r)
        tx, ty = x + math.sin(a) * 30, y - math.cos(a) * 30
        px, py = x + math.sin(a) * 48, y - math.cos(a) * 48
        nx, ny = math.cos(a) * 7, math.sin(a) * 7
        out += f'<path d="{poly([(tx - nx, ty - ny), (px, py), (tx + nx, ty + ny)])}"/>'
    return out


def lifeline():
    cx = cy = 128
    R, r = 96, 52
    def sector(a0, a1):
        a0, a1 = math.radians(a0), math.radians(a1)
        p = lambda rad, a: (cx + rad * math.cos(a), cy + rad * math.sin(a))
        x0, y0 = p(R, a0)
        x1, y1 = p(R, a1)
        x2, y2 = p(r, a1)
        x3, y3 = p(r, a0)
        return f'<path d="M{x0:.1f},{y0:.1f} A{R},{R} 0 0 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} A{r},{r} 0 0 0 {x3:.1f},{y3:.1f} Z"/>'
    out = ''.join(sector(a, a + 45) for a in (22.5, 112.5, 202.5, 292.5))
    out += ring(cx, cy, R, w) + ring(cx, cy, r, w)
    for a in (67.5, 157.5, 247.5, 337.5):
        t = math.radians(a)
        x, y = cx + (R + 10) * math.cos(t), cy + (R + 10) * math.sin(t)
        out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="none" stroke-width="7"/>'
    return out


ICONS = {
    'safety_net': ('Safety net', 'a net hung between two posts', safety_net),
    'firewall': ('Firewall', 'a brick wall with a flame held behind it', firewall),
    'bail_out': ('Bail out', 'a bucket tipping water out', bail_out),
    'stress_test': ('Stress test', 'a bell on a taut rope, ringing', stress_test),
    'prime_the_pump': ('Prime the pump', 'a hand pump with a drop at the spout', prime_the_pump),
    'ring_fence': ('Ring-fence', 'a ring of fence pickets', ring_fence),
    'haircut': ('Haircut', 'scissors', haircut),
    'clawback': ('Clawback', 'a paw print with claws', clawback),
    'lifeline': ('Lifeline', 'a lifebuoy', lifeline),
}


def svg(body, colour='currentColor', default=INK, size=256):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="{size}" height="{size}" style="color:{default}">'
            f'<g fill="{colour}" stroke="{colour}" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>\n')


def badge(body, key):
    inner = body.replace('id="', f'id="b_').replace('url(#', 'url(#b_')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
            f'<circle cx="128" cy="128" r="122" fill="{CREAM}" stroke="{INK}" stroke-width="8"/>'
            f'<g transform="translate(128 128) scale(0.7) translate(-128 -128)" fill="{INK}" stroke="{INK}" '
            f'stroke-linecap="round" stroke-linejoin="round">{inner}</g></svg>\n')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for key, (word, what, fn) in ICONS.items():
        body = fn()
        open(os.path.join(OUT, f'{key}.svg'), 'w').write(svg(body))
        open(os.path.join(OUT, f'{key}_badge.svg'), 'w').write(badge(body, key))
    print('wrote', len(ICONS) * 2, 'svg files to', OUT)
