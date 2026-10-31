/**
 * Whether this solidarity week's help has gone (the van has taken the
 * crates to the harbour); the week's price card comes only after it, never
 * with the letter. Kept free of systems and DOM, like stance.ts.
 */

let sailed = false;

export function aidSailed(): boolean {
  return sailed;
}

export function setAidSailed(next: boolean): void {
  sailed = next;
}

/**
 * Where the solidarity week's price card is: not come yet, riding up in the
 * second basket, or propped on the sill. BasketSystem runs the second haul.
 */
export type AidCard = 'none' | 'basket' | 'sill';

let card: AidCard = 'none';

export function aidCard(): AidCard {
  return card;
}

export function setAidCard(next: AidCard): void {
  card = next;
}
