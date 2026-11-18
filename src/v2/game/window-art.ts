/**
 * A neighbour's window as a picture, drawn in metres on a canvas: a frame
 * with one upright and one cross bar (four panes), curtains drawn back, a
 * sill; lit, the room behind it under its ceiling lamp (a shelf or a
 * picture on the back wall, sometimes someone at the window, a plant, a
 * cat) and the light it throws on the wall round the opening; dark, grey
 * glass with the sky and the roofs across the square on it. The same seed
 * draws the same window both ways, so one fades into the other.
 */

/** The wall round the opening that the picture also covers (the light that falls on it), in metres. */
export const MARGIN = 0.4;

const CURTAINS = ['#f1cf8e', '#cf7f52', '#b9b47c', '#dc9a7c', '#e8b860', '#c98a6a'];
const ROOMS = [
  ['#ffe596', '#f7b455', '#bd6f2c'],
  ['#ffeaa8', '#f4bd68', '#b87a3a'],
  ['#ffdc84', '#f0a044', '#ab5a22'],
  ['#fbe6a0', '#ecb968', '#a9803e'],
];

function rand(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** One window of w by h metres, with MARGIN of wall round it, into the cell at (x, y) of cw by ch pixels: lit from inside, or dark glass. */
export function drawWindow(g: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, w: number, h: number, seed: number, lit: boolean): void {
  const r = rand(seed + 7);
  const sx = cw / (w + MARGIN * 2);
  const sy = ch / (h + MARGIN * 2);
  const frame = 0.075;
  const bar = 0.05;
  const curtain = CURTAINS[Math.floor(r() * CURTAINS.length)];
  const room = ROOMS[Math.floor(r() * ROOMS.length)];
  const left = 0.16 + r() * 0.16;
  const right = 0.16 + r() * 0.16;
  const tied = r() < 0.6;
  const blind = r() < 0.3 ? 0.18 + r() * 0.2 : 0;
  const net = r() < 0.35;
  const lampX = 0.28 + r() * 0.44;
  const who = Math.floor(r() * 5);
  const whoX = 0.3 + r() * 0.4;
  const shelf = r() < 0.5;
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  g.translate(MARGIN, MARGIN);
  if (lit) {
    // The light that falls on the wall round the opening.
    g.save();
    g.shadowColor = 'rgba(255, 186, 96, 0.5)';
    g.shadowBlur = MARGIN * 0.75 * Math.min(sx, sy);
    g.fillStyle = 'rgba(255, 190, 100, 0.9)';
    g.fillRect(0.02, 0.02, w - 0.04, h - 0.04);
    g.fillRect(0.02, 0.02, w - 0.04, h - 0.04);
    g.restore();
  }
  // The frame.
  g.fillStyle = lit ? '#5d4a39' : '#7a7872';
  g.fillRect(0, 0, w, h);
  const gw = w - frame * 2;
  const gh = h - frame * 2;
  g.save();
  g.translate(frame, frame);
  g.beginPath();
  g.rect(0, 0, gw, gh);
  g.clip();
  if (lit) {
    // The room: brightest under its ceiling lamp, dimmer toward the floor and the corners.
    const wall = g.createLinearGradient(0, 0, 0, gh);
    wall.addColorStop(0, room[0]);
    wall.addColorStop(0.55, room[1]);
    wall.addColorStop(1, room[2]);
    g.fillStyle = wall;
    g.fillRect(0, 0, gw, gh);
    const dim = g.createRadialGradient(gw * lampX, gh * 0.22, gw * 0.2, gw * lampX, gh * 0.3, gw * 1.1);
    dim.addColorStop(0, 'rgba(120, 60, 20, 0)');
    dim.addColorStop(1, 'rgba(120, 60, 20, 0.55)');
    g.fillStyle = dim;
    g.fillRect(0, 0, gw, gh);
    if (shelf) {
      // A shelf of books on the back wall.
      const sy0 = gh * (0.46 + r() * 0.1);
      const from = gw * (lampX < 0.5 ? 0.52 : 0.1);
      g.fillStyle = 'rgba(92, 52, 24, 0.8)';
      g.fillRect(from, sy0, gw * 0.38, 0.025);
      let bx = from + 0.02;
      while (bx < from + gw * 0.36) {
        const bw = 0.03 + r() * 0.035;
        const bh = 0.11 + r() * 0.07;
        g.fillStyle = ['rgba(140, 62, 40, 0.85)', 'rgba(70, 86, 78, 0.85)', 'rgba(170, 120, 50, 0.85)', 'rgba(98, 60, 84, 0.85)'][Math.floor(r() * 4)];
        g.fillRect(bx, sy0 - bh, bw, bh);
        bx += bw + 0.008;
      }
    } else {
      // A picture on the back wall.
      const px = gw * (lampX < 0.5 ? 0.58 : 0.14);
      const py = gh * 0.36;
      g.fillStyle = 'rgba(92, 52, 24, 0.85)';
      g.fillRect(px, py, gw * 0.26, gh * 0.2);
      g.fillStyle = 'rgba(214, 190, 140, 0.9)';
      g.fillRect(px + 0.025, py + 0.025, gw * 0.26 - 0.05, gh * 0.2 - 0.05);
    }
    // The lamp: a cord, a shade, the glow under it.
    const lx = gw * lampX;
    const ly = gh * 0.2;
    const glow = g.createRadialGradient(lx, ly + 0.05, 0.01, lx, ly + 0.05, gw * 0.5);
    glow.addColorStop(0, 'rgba(255, 255, 240, 1)');
    glow.addColorStop(0.25, 'rgba(255, 244, 196, 0.75)');
    glow.addColorStop(1, 'rgba(255, 230, 160, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, gw, gh);
    g.fillStyle = 'rgba(70, 40, 20, 0.9)';
    g.fillRect(lx - 0.006, 0, 0.012, ly - 0.06);
    g.beginPath();
    g.moveTo(lx - 0.05, ly - 0.07);
    g.lineTo(lx + 0.05, ly - 0.07);
    g.lineTo(lx + 0.13, ly + 0.03);
    g.lineTo(lx - 0.13, ly + 0.03);
    g.closePath();
    g.fillStyle = '#9a4f26';
    g.fill();
    g.beginPath();
    g.ellipse(lx, ly + 0.05, 0.05, 0.035, 0, 0, Math.PI * 2);
    g.fillStyle = '#fffdf0';
    g.fill();
    if (net) {
      // A net across the lower panes.
      g.fillStyle = lit ? 'rgba(255, 240, 200, 0.32)' : 'rgba(120, 128, 136, 0.28)';
      g.fillRect(0, gh * 0.56, gw, gh * 0.44);
      g.fillStyle = lit ? 'rgba(255, 255, 255, 0.28)' : 'rgba(170, 178, 186, 0.12)';
      for (let nx = 0.03; nx < gw; nx += 0.06) g.fillRect(nx, gh * 0.56, 0.012, gh * 0.44);
    }
    // Who is home.
    const ink = 'rgba(58, 32, 18, 0.9)';
    const px = gw * whoX;
    g.fillStyle = ink;
    if (who === 0 || who === 1) {
      // Someone standing at the window: head and shoulders.
      const top = gh * 0.5;
      g.beginPath();
      g.ellipse(px, top + 0.11, 0.085, 0.105, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(px - 0.24, gh);
      g.quadraticCurveTo(px - 0.23, top + 0.27, px - 0.06, top + 0.23);
      g.lineTo(px + 0.06, top + 0.23);
      g.quadraticCurveTo(px + 0.23, top + 0.27, px + 0.24, gh);
      g.closePath();
      g.fill();
    } else if (who === 2) {
      // A plant on the sill.
      g.fillRect(px - 0.07, gh - 0.13, 0.14, 0.13);
      for (let k = -3; k <= 3; k += 1) {
        g.beginPath();
        g.ellipse(px + k * 0.045, gh - 0.24 - (3 - Math.abs(k)) * 0.035, 0.03, 0.11, k * 0.28, 0, Math.PI * 2);
        g.fill();
      }
    } else if (who === 3) {
      // A cat on the sill.
      g.beginPath();
      g.ellipse(px, gh - 0.1, 0.16, 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(px + 0.13, gh - 0.22, 0.065, 0.06, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(px + 0.08, gh - 0.26);
      g.lineTo(px + 0.095, gh - 0.33);
      g.lineTo(px + 0.13, gh - 0.27);
      g.lineTo(px + 0.165, gh - 0.33);
      g.lineTo(px + 0.185, gh - 0.26);
      g.closePath();
      g.fill();
    }
  } else {
    // Dark glass: the room behind it barely seen, the sky and the roofs across the square on it.
    const glass = g.createLinearGradient(0, 0, 0, gh);
    glass.addColorStop(0, '#2b3743');
    glass.addColorStop(0.5, '#18212b');
    glass.addColorStop(1, '#0d1219');
    g.fillStyle = glass;
    g.fillRect(0, 0, gw, gh);
  }
  if (net && !lit) {
    // A net across the lower panes.
    g.fillStyle = lit ? 'rgba(255, 240, 200, 0.32)' : 'rgba(120, 128, 136, 0.28)';
    g.fillRect(0, gh * 0.56, gw, gh * 0.44);
    g.fillStyle = lit ? 'rgba(255, 255, 255, 0.28)' : 'rgba(170, 178, 186, 0.12)';
    for (let nx = 0.03; nx < gw; nx += 0.06) g.fillRect(nx, gh * 0.56, 0.012, gh * 0.44);
  }
  // The curtains, drawn back to both sides.
  const cloth = (from: number, width: number, side: number): void => {
    const edge = from + width * side;
    g.beginPath();
    g.moveTo(from, 0);
    g.lineTo(edge, 0);
    if (tied) {
      g.bezierCurveTo(edge, gh * 0.35, from + width * side * 0.35, gh * 0.5, from + width * side * 0.4, gh * 0.62);
      g.bezierCurveTo(from + width * side * 0.5, gh * 0.75, from + width * side * 0.8, gh * 0.9, from + width * side * 0.85, gh);
    } else {
      g.lineTo(edge - side * 0.02, gh);
    }
    g.lineTo(from, gh);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = lit ? curtain : '#55575c';
    g.fillRect(Math.min(from, edge), 0, width, gh);
    // The folds.
    for (let k = 0; k < 5; k += 1) {
      const fx = Math.min(from, edge) + (width * (k + 0.5)) / 5;
      g.fillStyle = lit ? 'rgba(120, 58, 20, 0.22)' : 'rgba(10, 14, 20, 0.3)';
      g.fillRect(fx, 0, width / 12, gh);
      g.fillStyle = lit ? 'rgba(255, 246, 214, 0.25)' : 'rgba(150, 160, 170, 0.1)';
      g.fillRect(fx - width / 10, 0, width / 22, gh);
    }
    g.restore();
  };
  cloth(0, gw * left, 1);
  cloth(gw, gw * right, -1);
  if (blind > 0) {
    // A blind pulled part of the way down.
    g.fillStyle = lit ? '#f8e2b0' : '#62656a';
    g.fillRect(0, 0, gw, gh * blind);
    g.fillStyle = lit ? 'rgba(130, 70, 30, 0.5)' : 'rgba(10, 14, 20, 0.5)';
    g.fillRect(0, gh * blind - 0.02, gw, 0.02);
  }
  if (!lit) {
    // What the glass shows of the day outside: sky above, the roofs across the way below, two slants of light.
    const sky = g.createLinearGradient(0, 0, 0, gh);
    sky.addColorStop(0, 'rgba(150, 172, 192, 0.3)');
    sky.addColorStop(0.6, 'rgba(110, 130, 150, 0.08)');
    sky.addColorStop(1, 'rgba(8, 12, 18, 0.45)');
    g.fillStyle = sky;
    g.fillRect(0, 0, gw, gh);
    g.fillStyle = 'rgba(6, 9, 14, 0.4)';
    g.beginPath();
    g.moveTo(0, gh);
    g.lineTo(0, gh * 0.7);
    g.lineTo(gw * 0.2, gh * 0.7);
    g.lineTo(gw * 0.2, gh * 0.62);
    g.lineTo(gw * 0.45, gh * 0.62);
    g.lineTo(gw * 0.45, gh * 0.74);
    g.lineTo(gw * 0.7, gh * 0.74);
    g.lineTo(gw * 0.7, gh * 0.66);
    g.lineTo(gw, gh * 0.66);
    g.lineTo(gw, gh);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(205, 220, 232, 0.13)';
    for (const at of [0.18, 0.5]) {
      g.beginPath();
      g.moveTo(gw * at, 0);
      g.lineTo(gw * (at + 0.16), 0);
      g.lineTo(gw * (at - 0.25), gh);
      g.lineTo(gw * (at - 0.41), gh);
      g.closePath();
      g.fill();
    }
  } else {
    // A touch of the glass itself.
    g.fillStyle = 'rgba(255, 255, 255, 0.07)';
    g.beginPath();
    g.moveTo(gw * 0.2, 0);
    g.lineTo(gw * 0.34, 0);
    g.lineTo(gw * -0.06, gh);
    g.lineTo(gw * -0.2, gh);
    g.closePath();
    g.fill();
  }
  g.restore();
  // The glazing bars: one upright, one across, four panes.
  g.fillStyle = lit ? '#4a392b' : '#86847e';
  g.fillRect(w / 2 - bar / 2, frame, bar, gh);
  g.fillRect(frame, frame + gh * 0.4 - bar / 2, gw, bar);
  // The frame's inner edge: warm where the light catches it, shadowed when dark.
  g.lineWidth = 0.014;
  g.strokeStyle = lit ? 'rgba(255, 214, 150, 0.7)' : 'rgba(30, 34, 40, 0.6)';
  g.strokeRect(frame, frame, gw, gh);
  g.strokeStyle = lit ? 'rgba(40, 26, 16, 0.8)' : 'rgba(160, 158, 152, 0.9)';
  g.strokeRect(0.007, 0.007, w - 0.014, h - 0.014);
  // The sill.
  g.fillStyle = lit ? '#cfa878' : '#8d8b84';
  g.fillRect(-0.07, h - 0.01, w + 0.14, 0.075);
  g.fillStyle = lit ? 'rgba(255, 232, 180, 0.9)' : 'rgba(176, 176, 170, 0.8)';
  g.fillRect(-0.07, h - 0.01, w + 0.14, 0.018);
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(-0.05, h + 0.065, w + 0.1, 0.03);
  g.restore();
}
