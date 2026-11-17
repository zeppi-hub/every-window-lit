/**
 * Every line of the first ten minutes (S01-S11), word for word from the
 * design (META_VR_V2_TASARIM.md, Bölüm 2-6): the speaker as the caption
 * names them, and the line. Nothing here is written anew.
 */
export interface Line {
  speaker: string;
  text: string;
}

const line = (speaker: string, text: string): Line => ({ speaker, text });

export const LINES = {
  'S01-1': line('Gray', 'What this country needs now is… is a…'),
  'S01-2': line('Gray', '…fresh bread!'),
  'S01-3': line('Reporter', 'Prime Minister, did you say bread?'),
  'S03-1': line('Maya', 'My family baked here for forty years.'),
  'S03-2': line('Leo', 'That was our house. We had it for six.'),
  'S03-3': line('Sam', 'Dad worked that line for twenty years.'),
  'S03-4': line('', 'There you are. You remember that day too.'),
  'S04-1': line('Old man', 'You. You gave me the only words I had.'),
  'S04-2': line('Old man', 'It stopped when I did.'),
  'S04-3': line('', 'Take us back.'),
  'S05-1': line('', 'Not the bread. Not this time.'),
  'S05-2': line('Gray', 'Bird. Please. Something better.'),
  'S05-3': line('Catcher', 'Forty falls, bird. Never once hit the ground.'),
  'S06-1': line('Partner', "Don't watch her. Watch where she'll land."),
  'S06-2': line('Ringmaster', 'Ladies and gentlemen… the safety net!'),
  'H-1': line('Partner', 'Watch her shadow.'),
  'S07-1': line('Gray', '…a safety net. Your savings are guaranteed. Every one of them.'),
  'S07-2': line('Magpie', 'The bank is empty… empty… empty.'),
  'S07-3-maya': line('Maya', 'Dad kept the till under his bed for a year. Not this time.'),
  'S07-3-leo': line('Leo', 'Mom emptied our account that morning. Not this time.'),
  'S07-3-sam': line('Sam', 'Dad cashed his whole paycheck and hid it in a boot. Not this time.'),
  'S08-1': line('Gray', "It's spreading. Bird?"),
  'S08-2': line('Ranger', "You don't fight a fire like that. You starve it."),
  'S09-1': line('Chief', 'Hold the line! We need a firewall!'),
  'S10-1': line('Gray', 'We will build a firewall. No bank falls because its neighbour fell.'),
  'S11-1': line('', "That's me. I was nine."),
  'S11-2': line('Child', 'Fresh bread!'),
  'S11-3': line('', "Last time, by noon, it was already over. Look. It's noon."),
  'W-0': line('Gray', 'We already have one, bird.'),
  'W-2': line('Gray', "A wall can't stop people who are already running."),
  'E-T': line('Gray', 'Thank you, bird.'),
} as const satisfies Record<string, Line>;

export type LineId = keyof typeof LINES;

/** The three people of 2041 (S03); the empty speaker of a line above is whichever of them was chosen. */
export const PERSONAS = {
  maya: { name: 'Maya', model: 'dress', place: 'BROOKS BAKERY · CLOSED 2009', line: 'S03-1', firstRun: 'S07-3-maya' },
  leo: { name: 'Leo', model: 'suit', place: 'BANK OWNED', line: 'S03-2', firstRun: 'S07-3-leo' },
  sam: { name: 'Sam', model: 'suit', place: 'PLANT CLOSED', line: 'S03-3', firstRun: 'S07-3-sam' },
} as const;

export type PersonaId = keyof typeof PERSONAS;

/** Newspaper and notebook headlines (S02, S05, S07, S08). */
export const HEADLINES = {
  timeLapse: "PM: 'FRESH BREAD'. BANKS FALL.",
  run: 'RUN ON THE BANKS',
  runSolved: 'QUEUES MELT AWAY',
  spreads: 'PANIC SPREADS',
} as const;

/** The policy cards' six fields (Bölüm 5), as the cards print them. */
export interface CardText {
  title: string;
  done: string;
  when: string;
  effect: string;
  cost: string;
  objection: string;
}

export const CARDS: Readonly<Record<'safetyNet' | 'firewall', CardText>> = {
  safetyNet: {
    title: 'DEPOSITS GUARANTEED',
    done: 'The state promised to cover every saver, up to a higher limit.',
    when: 'In real life: 3 October 2008. Deposit insurance raised from $100,000 to $250,000.',
    effect: 'It worked: the queues at ordinary banks stopped.',
    cost: 'The price: the state took on the risk.',
    objection: '"Guarantee everything, and banks stop being careful."',
  },
  firewall: {
    title: 'STATE STANDS BEHIND BANK DEBT',
    done: 'The state guaranteed banks\' new borrowing, so one failure could not drag down the next.',
    when: 'In real life: 14 October 2008.',
    effect: 'It worked: banks could borrow again; the failures stopped spreading.',
    cost: "The price: the state's promises grew far bigger than its purse.",
    objection: '"If the state guarantees everyone, who guarantees the state?"',
  },
};

/** The boss fights' names and the gold words when won (Derinlik katmanları, 2). */
export const BOSSES = {
  run: { name: 'THE RUN', won: 'PANIC CALMED' },
  coldFire: { name: 'THE COLD FIRE', won: 'FIRE CONTAINED' },
} as const;

/** The words, as the feathers and Gray's balloon show them. */
export const WORDS = {
  freshBread: 'Fresh bread',
  safetyNet: 'Safety net',
  firewall: 'Firewall',
} as const;

/** The credits' lines (Bölüm 6, S31), the ones the first part can show. */
export const CREDITS = {
  safetyNet: 'Safety net. Deposit insurance, 2008.',
  secondTry: 'In real life, nobody got a second try.',
  simplified: 'Simplified. Based mainly on the United States, 2008–2010; ring-fencing is British.',
} as const;
