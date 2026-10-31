import { Audio, type AudioListener, AudioLoader, createSystem, type Entity, type Object3D, PositionalAudio, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { aidCard } from '../aid.js';
import { onSignal, type SignalName } from '../signals.js';
import { stance } from '../stance.js';
import { EMPTY, levels, type RealWeek, type Town } from '../season/model.js';
import { currentTown, realWeek } from '../season/store.js';

/**
 * The window's sound (META_VR_FIKIR.md §8). Interactions play short CC0
 * recordings from Kenney's audio packs (public/audio, CREDITS.md) where they
 * happen; the town's bed is made here with WebAudio, so it costs no files:
 * the sea and wind, distant traffic that thins in a dear fuel week, and the
 * market's murmur that thins with its stalls. With the shutters closed
 * everything is muffled; down on the square it is louder. Words are always
 * written, never spoken. The sound starts with the first touch (Enter VR,
 * or the latch).
 */

const FILES = [
  'metalLatch', 'doorOpen_1', 'doorClose_2', 'creak2', 'handleCoins', 'bookFlip1', 'dropLeather', 'chop',
  'metalClick', 'impactBell_heavy_000', 'impactGlass_light_001', 'impactPlank_medium_000', 'click_002',
] as const;
type Clip = (typeof FILES)[number];

/** Muffled through the closed shutters, open to the town. */
const SHUT_HZ = 700;
const OPEN_HZ = 18000;
/** How loud each layer of the bed is, at a calm week with the shutters open. */
const SEA = 0.16;
const WIND = 0.05;
const TRAFFIC = 0.07;
const MARKET = 0.06;

export class SoundSystem extends createSystem({
  week: { required: [Week] },
}) {
  private listener: AudioListener | null = null;
  private buffers = new Map<Clip, AudioBuffer>();
  private voices: PositionalAudio[] = [];
  private flat: Audio | null = null;
  private next = 0;
  private filter: BiquadFilterNode | null = null;
  private bed: { sea: GainNode; wind: GainNode; traffic: GainNode; market: GainNode } | null = null;
  private last = { phase: '', open: false, chosen: -1, keeperNotch: -1, card: 'none', real: null as RealWeek | null, town: null as Town | null, out: -1 };
  private place = new Vector3();

  init(): void {
    this.listener = (this.player.head.children.find((c) => (c as Object3D & { type: string }).type === 'AudioListener') as AudioListener | undefined) ?? null;
    const listener = this.listener;
    if (listener == null) return;
    const loader = new AudioLoader();
    for (const name of FILES) loader.load(`./audio/${name}.ogg`, (buffer) => this.buffers.set(name, buffer));
    // A few positional voices, reused in turn, and one flat one for the room.
    for (let i = 0; i < 6; i += 1) {
      const voice = new PositionalAudio(listener);
      voice.setRefDistance(0.6);
      voice.setRolloffFactor(1.2);
      this.world.scene.add(voice);
      this.voices.push(voice);
    }
    this.flat = new Audio(listener);
    const context = listener.context;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = SHUT_HZ;
    listener.setFilter(this.filter);
    this.bed = makeBed(context, listener.getInput());

    // The first touch wakes the sound; browsers keep it asleep until then.
    const wake = () => {
      if (context.state === 'suspended') void context.resume();
    };
    window.addEventListener('pointerdown', wake);
    this.renderer.xr.addEventListener('sessionstart', wake);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', wake),
      () => this.renderer.xr.removeEventListener('sessionstart', wake),
      onSignal('latch', () => {
        wake();
        this.at('Latch', 'metalLatch', 0.8);
      }),
      ...(
        [
          ['rope', 'RopeToggleMesh', 'creak2', 0.7],
          ['lower', 'BrakeLever', 'metalClick', 0.7],
          ['knock', 'FamilyGlass', 'impactGlass_light_001', 0.8],
          ['lamp', 'SundayLamp', 'metalClick', 0.5],
          ['up', 'ArrowUp', 'click_002', 0.6],
          ['down', 'ArrowDown', 'click_002', 0.6],
          ['tocco', 'Tocco', 'click_002', 0.4],
        ] as const
      ).map(([signal, at, clip, gain]) => onSignal(signal as SignalName, () => this.at(at, clip, gain))),
    );
  }

  update(): void {
    const week = this.weekEntity();
    if (week == null || this.listener == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const context = this.listener.context;

    // The shutters: a creak as they swing, and the town comes through once they are open.
    if (open !== this.last.open) {
      this.last.open = open;
      this.at('Latch', open ? 'doorOpen_1' : 'doorClose_2', 0.6);
      this.filter?.frequency.setTargetAtTime(open || stance() === 'walk' ? OPEN_HZ : SHUT_HZ, context.currentTime, 0.35);
    }
    if (phase !== this.last.phase) {
      this.onPhase(phase, chosen);
      this.last.phase = phase;
    }
    if (phase === Phase.Choosing && chosen !== this.last.chosen && chosen >= 0) this.at('Basket', 'dropLeather', 0.7);
    this.last.chosen = chosen;
    const notches = currentTown().keeperNotches + currentTown().toccoNotches;
    if (this.last.keeperNotch >= 0 && notches > this.last.keeperNotch) this.at('Latch', 'chop', 0.5);
    this.last.keeperNotch = notches;

    // The solidarity week's second basket brings its card.
    const card = aidCard();
    if (card !== this.last.card) {
      if (card === 'basket') this.at('Basket', 'bookFlip1', 0.4);
      this.last.card = card;
    }
    this.tuneBed(week, open, context.currentTime);
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private onPhase(phase: string, chosen: number): void {
    switch (phase) {
      case Phase.Bell:
        // The bell rings from the tower above the window (never in a solidarity week: no Bell phase there).
        this.atPoint(0, 13, -1, 'impactBell_heavy_000', 0.9, 6);
        break;
      case Phase.Rising:
        this.at('Basket', 'bookFlip1', 0.4);
        break;
      case Phase.Choosing:
        this.at('Basket', 'impactPlank_medium_000', 0.6);
        break;
      case Phase.Lowering:
        this.at('RopeToggleMesh', 'creak2', 0.5);
        if (chosen >= 0) this.at('CoinJar', 'handleCoins', 0.6);
        break;
      default:
        break;
    }
  }

  /** The bed follows the week: traffic with the cars at the kerb, the market with its stalls; louder on the square. */
  private tuneBed(week: Entity, open: boolean, now: number): void {
    const bed = this.bed;
    if (bed == null) return;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    const town = currentTown();
    const out = stance() === 'walk' ? 1.6 : open ? 1 : 0.55;
    // Worked out again only when the week, the town or where the Keeper is changes.
    if (real === this.last.real && town === this.last.town && out === this.last.out) return;
    this.last.real = real;
    this.last.town = town;
    this.last.out = out;
    const shown = real != null ? levels(real, town, EMPTY) : { fuel: 0, power: 0, food: 0 };
    const traffic = TRAFFIC * (1 - 0.22 * Math.max(0, shown.fuel)) * (shown.fuel < 0 ? 1.25 : 1);
    const market = MARKET * (1 - 0.25 * Math.max(0, shown.food));
    bed.sea.gain.setTargetAtTime(SEA * out, now, 0.5);
    bed.wind.gain.setTargetAtTime(WIND * out, now, 0.5);
    bed.traffic.gain.setTargetAtTime(traffic * out, now, 0.8);
    bed.market.gain.setTargetAtTime(market * out, now, 0.8);
  }

  /** Plays a clip where a named thing is (its geometry's middle, since many meshes carry world coordinates). */
  private at(name: string, clip: Clip, gain: number): void {
    const object = this.world.scene.getObjectByName(name);
    if (object == null) return;
    object.getWorldPosition(this.place);
    if (this.place.lengthSq() < 1e-6) {
      // A mesh built in world coordinates sits at the origin: use its bounds instead.
      const geometry = (object as Object3D & { geometry?: { boundingSphere: { center: Vector3 } | null; computeBoundingSphere: () => void } }).geometry;
      if (geometry != null) {
        if (geometry.boundingSphere == null) geometry.computeBoundingSphere();
        if (geometry.boundingSphere != null) this.place.copy(geometry.boundingSphere.center);
      }
    }
    this.sound(clip, gain, 0.6);
  }

  private atPoint(x: number, y: number, z: number, clip: Clip, gain: number, ref: number): void {
    this.place.set(x, y, z);
    this.sound(clip, gain, ref);
  }

  private sound(clip: Clip, gain: number, ref: number): void {
    const buffer = this.buffers.get(clip);
    if (buffer == null || this.listener == null || this.listener.context.state !== 'running') return;
    const voice = this.voices[this.next];
    this.next = (this.next + 1) % this.voices.length;
    if (voice.isPlaying) voice.stop();
    voice.position.copy(this.place);
    voice.setRefDistance(ref);
    voice.setBuffer(buffer);
    voice.setVolume(gain);
    voice.play();
  }
}

/** Noise loops filtered into sea, wind, traffic and market layers, each with its own gain; started once, run quietly. */
function makeBed(context: AudioContext, into: AudioNode): { sea: GainNode; wind: GainNode; traffic: GainNode; market: GainNode } {
  const noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const data = noise.getChannelData(0);
  // Brown-ish noise: a random walk, kept centred.
  let walk = 0;
  for (let i = 0; i < data.length; i += 1) {
    walk = (walk + (Math.random() * 2 - 1) * 0.04) * 0.996;
    data[i] = walk * 3;
  }
  const layer = (type: BiquadFilterType, frequency: number, q: number, wobbleHz: number, wobble: number): GainNode => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    // A slow swell, like waves or gusts.
    const swell = context.createGain();
    swell.gain.value = 1 - wobble;
    const lfo = context.createOscillator();
    lfo.frequency.value = wobbleHz;
    const depth = context.createGain();
    depth.gain.value = wobble;
    lfo.connect(depth).connect(swell.gain);
    const level = context.createGain();
    level.gain.value = 0;
    source.connect(filter).connect(swell).connect(level).connect(into);
    source.start();
    lfo.start();
    return level;
  };
  return {
    sea: layer('lowpass', 420, 0.7, 0.11, 0.45),
    wind: layer('bandpass', 900, 0.6, 0.05, 0.6),
    traffic: layer('lowpass', 160, 1.2, 0.2, 0.2),
    market: layer('bandpass', 650, 2.2, 1.7, 0.35),
  };
}
