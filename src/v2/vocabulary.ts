import { emitV2 } from './events.js';

/**
 * The parrot's words: the one it knows from the
 * start (its person's word, on a grey feather), then each word a memory
 * gives it, in the order learned, one feather each in the six empty slots
 * of its wing. Selecting is taking a feather; speaking is holding it up to
 * the leader's ear, who says the word, right or wrong (the scene judges).
 * Pure state, with the moments sent on the v2 event bus.
 */
export const WING_SLOTS = 7;

export interface Word {
  /** What is said (the feather's writing, the leader's balloon). */
  text: string;
  /** The feather's colour (0xRRGGBB); the first word's is grey. */
  colour: number;
}

export class Vocabulary {
  private readonly words: Word[] = [];
  private spokenWords: string[] = [];
  /** The word on the feather held now, or null. */
  selected: string | null = null;
  /** Grows with every word learned, so a wing can see it has a feather to add. */
  version = 0;

  get learned(): readonly Word[] {
    return this.words;
  }
  get spoken(): readonly string[] {
    return this.spokenWords;
  }

  has(text: string): boolean {
    return this.words.some((w) => w.text === text);
  }

  /** Learn a word (once; at most WING_SLOTS); false if known already or the wing is full. */
  learn(text: string, colour: number): boolean {
    if (this.has(text) || this.words.length >= WING_SLOTS) return false;
    this.words.push({ text, colour });
    this.version += 1;
    emitV2('wordLearned', { word: text });
    return true;
  }

  /** A feather is taken (its word is the one chosen), or put back (null). Only a learned word can be chosen. */
  select(text: string | null): void {
    this.selected = text != null && this.has(text) ? text : null;
  }

  /** The chosen word reaches the leader's ear: it is said. */
  speak(text: string): boolean {
    if (!this.has(text)) return false;
    this.spokenWords.push(text);
    emitV2('wordSpoken', { word: text });
    return true;
  }

  /** A new day: no words but those given again (the start page's restart). */
  reset(): void {
    this.words.length = 0;
    this.spokenWords = [];
    this.selected = null;
    this.version += 1;
  }
}

/**
 * Where slot `i` sits on the wing, in the wing's frame (m): a row from the
 * shoulder outward and a little down, first slot nearest the shoulder;
 * and how much it turns about the up axis (radians): each feather points
 * ahead, across the row, the row opening a little like a hand of cards.
 */
export function slotPlace(i: number): { x: number; y: number; z: number; lean: number } {
  const k = i / (WING_SLOTS - 1);
  // Side by side and parallel, not end to end along the row (a feather is 10 cm long): a pinch on one is centimetres from any other.
  return { x: -0.03 - SLOT_STEP * (WING_SLOTS - 1) * k, y: -0.03 * k * k, z: -0.015 * Math.sin(Math.PI * k), lean: -1.75 + 0.35 * k };
}

/** The gap between two feathers on the wing (m). */
export const SLOT_STEP = 0.06;
