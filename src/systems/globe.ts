import { type CanvasTexture, createSystem, type Entity, GrabSystem, Grabbed, type Mesh, type MeshBasicMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { Globe, Phase, Week } from '../components.js';
import { basketTrip, GIFT_REST, globeAt, lampHasGlass, LOAD_REACH, noteSeconds, restingAt, SEAT_REACH, setGlobeAt, setNoteSeconds } from '../globe.js';
import { GIFT_NOTE, TOWN_NOTE } from '../season/lines.js';
import { CLIMAX_WEEK, GLOBE_WEEK } from '../season/model.js';
import { globeChoice, noteGlobePlaced } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { tapOnlyByTouch } from '../touch-taps.js';
import { drawNote, GLOBE_IN_BASKET, GLOBE_ON_SILL, NOTE_IN_BASKET } from '../station/globe.js';
import { BASKET_ON_SILL } from '../station/layout.js';
import { LAMP } from '../station/tocco.js';

/** How far past its reach a glass taken out of the basket must go before it can go in again (m). */
const LOAD_CLEAR = 0.04;
/** Let go, it eases back to where it waits at this rate (per second). */
const HOME_RATE = 8;
/** A hidden globe is parked this far below the town: a ray or a hand must not find it. */
const PARKED = 200;

/**
 * The loose glass globe and the note that rides with it (globe.ts). While
 * the globe is on the lamp the lamp's own glass shows and this one is put
 * away, except on the climax's Sunday, when the glass may be lifted off.
 */
export class GlobeSystem extends createSystem({
  globe: { required: [Globe] },
  week: { required: [Week] },
}) {
  private glass: Mesh | null = null;
  private note: Mesh | null = null;
  private noteTexture: CanvasTexture | null = null;
  private noteText = '';
  private weekNow = 0;
  private clearOfBasket = true;
  private target = new Vector3();
  private readonly lamp = new Vector3(LAMP.x, LAMP.y, LAMP.z);
  private readonly basket = new Vector3(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);

  init(): void {
    this.glass = (this.world.scene.getObjectByName('SundayLampGlass') as Mesh | undefined) ?? null;
    this.note = (this.world.scene.getObjectByName('BasketNote') as Mesh | undefined) ?? null;
    this.noteTexture = ((this.note?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | undefined) ?? null;
    this.cleanupFuncs.push(onSignal('restart', () => this.restart()));
  }

  /** The season starts over: the week's change puts the globe where it belongs. */
  restart(): void {
    this.weekNow = 0;
    setNoteSeconds(0);
  }

  update(delta: number): void {
    let week: Entity | null = null;
    for (const entity of this.queries.week.entities) week = entity;
    let entity: Entity | null = null;
    for (const e of this.queries.globe.entities) entity = e;
    const globe = entity?.object3D;
    if (week == null || entity == null || globe == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    if (n !== this.weekNow) {
      this.weekNow = n;
      setGlobeAt(restingAt(n, globeChoice() === 'sent'));
    }
    tapOnlyByTouch(entity);
    const basket = week.object3D;
    const held = entity.hasComponent(Grabbed);
    const trip = basketTrip();
    const lifting = n === CLIMAX_WEEK && phase === Phase.Sunday && globeChoice() == null && trip === 'town';
    this.placeNote(trip, basket ?? null, delta);

    if (held) {
      // Taken back out of the basket: it goes in again only once it has been clear of it.
      if (globeAt() === 'load') this.clearOfBasket = false;
      else if (globe.position.distanceTo(this.basket) > LOAD_REACH + LOAD_CLEAR) this.clearOfBasket = true;
      setGlobeAt('held');
      const grab = this.world.getSystem(GrabSystem);
      // The lever has been pulled: it stays in the basket.
      if (globeChoice() === 'sent') {
        grab?.forceRelease(entity);
        setGlobeAt(trip === 'town' ? 'load' : 'gone');
      } else if (n === GLOBE_WEEK && globe.position.distanceTo(this.lamp) < SEAT_REACH) {
        grab?.forceRelease(entity);
        noteGlobePlaced();
        this.seat();
      } else if (lifting && noteSeconds() > 0 && this.clearOfBasket && globe.position.distanceTo(this.basket) < LOAD_REACH) {
        grab?.forceRelease(entity);
        setGlobeAt('load');
        emitSignal('seated');
      }
    } else if (globeAt() === 'held') {
      // Let go: back to where it waits.
      setGlobeAt(n === GLOBE_WEEK ? 'sill' : globeChoice() === 'sent' ? 'gone' : 'lamp');
    }
    // Its own Sunday comes: it settles in the lamp by itself, so no climax is ever missing its glass.
    if (n === GLOBE_WEEK && phase === Phase.Sunday && (globeAt() === 'sill' || globeAt() === 'basket')) this.seat();
    if (this.glass != null) (this.glass.material as MeshBasicMaterial).visible = lampHasGlass(globeAt()) && !lifting;

    const where = globeAt();
    const shown = where === 'basket' || where === 'sill' || where === 'held' || where === 'load' || (where === 'lamp' && lifting);
    globe.visible = shown;
    if (!shown) {
      globe.position.y = -PARKED;
      return;
    }
    if (where === 'held') return;
    if ((where === 'basket' || where === 'load') && basket != null) {
      globe.position.set(basket.position.x + GLOBE_IN_BASKET.x, basket.position.y + GLOBE_IN_BASKET.y, basket.position.z + GLOBE_IN_BASKET.z);
      globe.quaternion.identity();
      return;
    }
    this.target.set(where === 'sill' ? GLOBE_ON_SILL.x : LAMP.x, where === 'sill' ? GLOBE_ON_SILL.y : LAMP.y, where === 'sill' ? GLOBE_ON_SILL.z : LAMP.z);
    if (globe.position.y < 0) globe.position.copy(this.target);
    const k = 1 - Math.exp(-HOME_RATE * delta);
    globe.position.lerp(this.target, k);
    globe.quaternion.identity();
  }

  /** Dev keys only (dev-tools.ts): the glass goes where a hand would take it: in the lamp in its own week, in the town's basket on the climax's Sunday. Empty when shipped. */
  devMove(): void {
    if (!import.meta.env.DEV) return;
    if (this.weekNow === GLOBE_WEEK && globeAt() !== 'lamp' && globeAt() !== 'away') {
      noteGlobePlaced();
      this.seat();
    } else if (this.weekNow === CLIMAX_WEEK && basketTrip() === 'town' && globeChoice() == null) {
      setGlobeAt('load');
      emitSignal('seated');
    }
  }

  /** The globe settles in the lamp. */
  private seat(): void {
    setGlobeAt('lamp');
    emitSignal('seated');
  }

  /** The note rides in the basket on its own trips, and is timed while it waits on the sill. */
  private placeNote(trip: string, basket: Object3D | null, delta: number): void {
    const note = this.note;
    if (note == null) return;
    const riding = (trip === 'gift' || trip === 'town') && basket != null;
    note.visible = riding;
    if (!riding || basket == null) {
      if (trip === 'none') setNoteSeconds(0);
      return;
    }
    const text = trip === 'gift' ? GIFT_NOTE : TOWN_NOTE;
    if (text !== this.noteText && this.noteTexture != null) {
      this.noteText = text;
      drawNote(this.noteTexture, text);
    }
    note.position.set(basket.position.x + NOTE_IN_BASKET.x, basket.position.y + NOTE_IN_BASKET.y, basket.position.z + NOTE_IN_BASKET.z);
    note.rotation.set(NOTE_IN_BASKET.tilt, NOTE_IN_BASKET.yaw, 0, 'YXZ');
    if (stance() === 'seat' && basket.position.distanceTo(this.basket) < 0.02) setNoteSeconds(Math.min(GIFT_REST * 2, noteSeconds() + delta));
  }
}
