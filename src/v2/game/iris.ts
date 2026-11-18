import { CanvasTexture, ClampToEdgeWrapping, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { DirectorSystem } from './director.js';

/** How far in front of the eye the mask hangs (m), and its size there: far wider than any headset's view, 3:2 like its picture. */
const AT = 1.2;
const WIDE = 9.6;
const TALL = 6.4;
/** The eye's opening as a scale of its picture: wide open (past every edge of the view), and shut. */
const OPEN = 0.15;
const SHUT = 80;
const DARK = 4000;

/** Black with an almond-shaped eye cut out of the middle, its lids soft; the edges stay black when the picture is scaled down. */
function eyePicture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'destination-out';
    g.filter = 'blur(10px)';
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const w = 230;
    const h = 105;
    g.beginPath();
    g.moveTo(cx - w, cy);
    g.quadraticCurveTo(cx, cy - h * 2, cx + w, cy);
    g.quadraticCurveTo(cx, cy + h * 2, cx - w, cy);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * An eye closing and opening over the view (the film's iris, in the shape of
 * an eye): a black mask on the head with an eye-shaped opening that shrinks
 * onto a point and opens again. The view itself never moves; only the dark
 * closes in, so nothing in it can make a seated player sick.
 */
export class Iris {
  private readonly mesh: Mesh;
  private readonly picture: CanvasTexture;
  private readonly at = new Vector3();
  private cu = 0.5;
  private cv = 0.5;

  constructor(private readonly head: Object3D) {
    this.picture = eyePicture();
    this.mesh = new Mesh(new PlaneGeometry(WIDE, TALL), new MeshBasicMaterial({ map: this.picture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.name = 'EyeIris';
    this.mesh.renderOrder = 9550;
    this.mesh.position.set(0, 0, -AT);
    this.mesh.pointerEvents = 'none';
    this.mesh.frustumCulled = false;
    this.set(OPEN);
    head.add(this.mesh);
  }

  /** Close onto `onto` (a point in the world, followed as the head turns), over `seconds`; the view is then dark. */
  close(d: DirectorSystem, onto: Object3D | null, seconds = 1.1): Promise<void> {
    return this.run(d, OPEN, SHUT, seconds, onto).then(() => this.set(DARK));
  }

  /** Open from the middle of the view, over `seconds`. */
  open(d: DirectorSystem, seconds = 0.9): Promise<void> {
    this.cu = 0.5;
    this.cv = 0.5;
    return this.run(d, SHUT, OPEN, seconds, null);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.picture.dispose();
  }

  private run(d: DirectorSystem, from: number, to: number, seconds: number, onto: Object3D | null): Promise<void> {
    return new Promise((done) => {
      let t = 0;
      const stop = d.each((delta) => {
        t = Math.min(1, t + delta / seconds);
        const k = t * t * (3 - 2 * t);
        if (onto != null) this.centre(onto);
        this.set(from * Math.pow(to / from, k));
        if (t >= 1) {
          stop();
          done();
        }
      });
    });
  }

  /** Where `onto` falls on the mask, as seen from the eye. */
  private centre(onto: Object3D): void {
    onto.getWorldPosition(this.at);
    this.head.worldToLocal(this.at);
    if (this.at.z > -0.05) return;
    const k = -AT / this.at.z;
    this.cu = Math.max(0.1, Math.min(0.9, (this.at.x * k) / WIDE + 0.5));
    this.cv = Math.max(0.1, Math.min(0.9, (this.at.y * k) / TALL + 0.5));
  }

  /** The opening at scale `s` of its picture, centred where it falls. */
  private set(s: number): void {
    this.picture.repeat.set(s, s);
    this.picture.offset.set(0.5 - this.cu * s, 0.5 - this.cv * s);
  }
}

/**
 * The opening's lines in the dark: large pale words on nothing, a little
 * below the eye's level and well inside the narrowest view, each fading in,
 * held, and fading out. On the head, since there is nothing in the dark for
 * them to stand on.
 */
export class TitleCard {
  private readonly mesh: Mesh;
  private readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;

  constructor(head: Object3D) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1536;
    this.canvas.height = 576;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(1.8, 0.675), new MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.name = 'TitleCard';
    this.mesh.renderOrder = 9600;
    this.mesh.position.set(0, -0.04, -1.6);
    this.mesh.pointerEvents = 'none';
    this.mesh.frustumCulled = false;
    head.add(this.mesh);
  }

  /** One line: in, held for `hold` seconds, out. */
  async line(d: DirectorSystem, text: string, hold: number): Promise<void> {
    this.draw(text);
    await this.fade(d, 0, 1, 0.45);
    await d.wait(hold);
    await this.fade(d, 1, 0, 0.45);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.texture.dispose();
  }

  private fade(d: DirectorSystem, from: number, to: number, seconds: number): Promise<void> {
    const material = this.mesh.material as MeshBasicMaterial;
    return new Promise((done) => {
      let t = 0;
      const stop = d.each((delta) => {
        t = Math.min(1, t + delta / seconds);
        material.opacity = from + (to - from) * t;
        if (t >= 1) {
          stop();
          done();
        }
      });
    });
  }

  /** The words centred, broken into as many rows as they need (at spaces) to stay inside the card. */
  private draw(text: string): void {
    const g = this.canvas.getContext('2d');
    if (g == null) return;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const size = 126;
    g.font = `500 ${size}px Georgia, 'Times New Roman', serif`;
    const room = this.canvas.width - 140;
    const rows: string[] = [];
    for (const word of text.split(' ')) {
      const last = rows.length - 1;
      if (last >= 0 && g.measureText(`${rows[last]} ${word}`).width <= room) rows[last] = `${rows[last]} ${word}`;
      else rows.push(word);
    }
    g.fillStyle = '#f2ede4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = size * 1.3;
    const top = this.canvas.height / 2 - ((rows.length - 1) * step) / 2;
    rows.forEach((row, i) => g.fillText(row, this.canvas.width / 2, top + i * step));
    this.texture.needsUpdate = true;
  }
}
