import { Audio, type AudioListener, AudioLoader, type Object3D } from '@iwsdk/core';

/**
 * The new version's sounds (art/v2/ses/README.md): seventeen short CC0
 * clips. Beds loop under a scene (the rain, the crowd, a fire) and fade in
 * and out; one-shots play once (a loaf landing, the crowd booing, the
 * applause after a fight, a page turned). Flat, through the head's
 * listener; the volumes are the README's starting mix.
 */
export const SOUND_FILES = [
  'rain_loop',
  'crowd_murmur_loop',
  'crowd_boo',
  'applause',
  'loaf_drop',
  'bank_creak',
  'fire_loop',
  'clock_tick_loop',
  'paper',
  'mic_tap',
  'bucket_splash',
  'waves_loop',
  'wind_loop',
  'ship_creak',
  'pump_stroke',
  'pump_water_loop',
  'feather_rustle',
  'grab_soft',
  'rope_creak',
  'sand_pour',
  'sandbag_drop',
  'wing_flap',
  'wing_flaps',
  'ear_click',
  'water_pour',
  // The circus show (CC0, Freesound; sources in public/credits-v2.html).
  'tent_crowd_loop',
  'crowd_gasp',
  'drum_roll_loop',
  'cymbal_hit',
  'net_twang',
  'wind_gust',
  'heartbeat_loop',
  'fall_whoosh',
  'cheer',
  'wire_creak',
  'cannon_boom',
  'fuse_burn',
  'catch_slap',
  'swing_whoosh',
  // The run's glass (Kenney Impact Sounds, CC0).
  'glass_crack',
  // The storm ship (CC0, Freesound; sources in public/credits-v2.html).
  'ship_bell',
  'thunder',
] as const;
export type SoundName = (typeof SOUND_FILES)[number];

/** How fast a bed fades (volume per second). */
const FADE = 0.8;

export class Sounds {
  private readonly listener: AudioListener | null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly beds = new Map<SoundName, { audio: Audio; want: number }>();
  private readonly shots: Audio[] = [];
  private next = 0;

  constructor(head: Object3D) {
    this.listener = (head.children.find((c) => (c as Object3D & { type: string }).type === 'AudioListener') as AudioListener | undefined) ?? null;
    if (this.listener == null) {
      if (import.meta.env.DEV) console.warn('[sound] no listener on the head');
      return;
    }
    const loader = new AudioLoader();
    for (const name of SOUND_FILES)
      loader.load(`./v2/ses/${name}.ogg`, (buffer) => {
        this.buffers.set(name, buffer);
        if (import.meta.env.DEV && this.buffers.size === SOUND_FILES.length) console.info(`[sound] ${this.buffers.size} sounds in`);
      });
    for (let i = 0; i < 6; i += 1) this.shots.push(new Audio(this.listener));
  }

  /** A bed: fade it to `volume` (0 stops it once faded out). */
  bed(name: SoundName, volume: number, rate = 1): void {
    if (this.listener == null) return;
    let bed = this.beds.get(name);
    if (bed == null) {
      const audio = new Audio(this.listener);
      audio.setLoop(true);
      audio.setVolume(0);
      bed = { audio, want: 0 };
      this.beds.set(name, bed);
    }
    bed.want = volume;
    bed.audio.setPlaybackRate(rate);
  }

  /** A one-shot, `delay` seconds from now. */
  play(name: SoundName, volume: number, rate = 1, delay = 0): void {
    const buffer = this.buffers.get(name);
    if (buffer == null || this.shots.length === 0) return;
    const audio = this.shots[this.next];
    this.next = (this.next + 1) % this.shots.length;
    if (audio.isPlaying) audio.stop();
    audio.setBuffer(buffer);
    audio.setVolume(volume);
    audio.setPlaybackRate(rate);
    audio.play(delay);
  }

  update(delta: number): void {
    for (const [name, bed] of this.beds) {
      const audio = bed.audio;
      const now = audio.getVolume();
      if (bed.want > 0 && !audio.isPlaying) {
        const buffer = this.buffers.get(name);
        if (buffer == null) continue;
        audio.setBuffer(buffer);
        audio.play();
      }
      if (now === bed.want) continue;
      const step = FADE * delta;
      const volume = now < bed.want ? Math.min(bed.want, now + step) : Math.max(bed.want, now - step);
      audio.setVolume(volume);
      if (volume <= 0 && audio.isPlaying) audio.stop();
    }
  }
}
