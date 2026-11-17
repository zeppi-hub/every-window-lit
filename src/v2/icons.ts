/**
 * The words' pictures (META_VR_V2_TASARIM.md, Bölüm 8b; art/v2/simge): one
 * picture per word, the same everywhere it appears (the feather, the orb,
 * Gray's balloon, the policy card, the notebook, the credits), so the game
 * reads without a word of English. Each comes as a cream badge
 * (`<id>_badge.png`) and a white, tintable line drawing (`<id>.png`).
 * Loaded once as images, for canvases and textures to draw.
 */
const IDS: Readonly<Record<string, string>> = {
  'Safety net': 'safety_net',
  Firewall: 'firewall',
  'Bail out': 'bail_out',
  'Stress test': 'stress_test',
  'Prime the pump': 'prime_the_pump',
  'Ring-fence': 'ring_fence',
  Haircut: 'haircut',
  Clawback: 'clawback',
  Lifeline: 'lifeline',
};

const badges = new Map<string, HTMLImageElement>();
const lines = new Map<string, HTMLImageElement>();

function load(url: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image;
}

/** Start loading every word's pictures (once). */
export function loadWordIcons(): void {
  if (badges.size > 0) return;
  for (const [word, id] of Object.entries(IDS)) {
    badges.set(word, load(`./v2/simge/${id}_badge.png`));
    lines.set(word, load(`./v2/simge/${id}.png`));
  }
}

/** The word's cream badge, if it has one and it has loaded. */
export function wordBadge(word: string): HTMLImageElement | null {
  const image = badges.get(word);
  return image != null && image.complete && image.naturalWidth > 0 ? image : null;
}

/** The word's white line drawing (to tint), if loaded. */
export function wordLines(word: string): HTMLImageElement | null {
  const image = lines.get(word);
  return image != null && image.complete && image.naturalWidth > 0 ? image : null;
}

/** Whether the word has a picture at all (the family's word, "Fresh bread", has none). */
export function hasIcon(word: string): boolean {
  return word in IDS;
}
