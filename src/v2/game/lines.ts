/**
 * Every line of the first ten minutes (S01-S11), word for word from the
 * design: the speaker as the caption
 * names them, and the line. Nothing here is written anew.
 */
export interface Line {
  speaker: string;
  text: string;
}

const line = (speaker: string, text: string): Line => ({ speaker, text });

/** The opening, in the dark before the first picture: three lines, one after another. */
export const OPENING_TITLE: readonly string[] = [
  '2008. The banks are failing. Crowds at every door.',
  'The Prime Minister must speak to them. He never finds the words.',
  'He has a parrot. You.',
];

export const LINES = {
  'S01-0': line('Reporter', 'Prime Minister! What do you tell these people?'),
  'S01-0b': line('Gray', 'Bird… give me a word.'),
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
  'S05-2b': line('Gray', 'Six troubles are coming today. A word for each, or the windows go dark.'),
  'S05-3': line('Catcher', 'Forty falls, bird. Never once hit the ground.'),
  'S06-0': line('Catcher', 'Three acts, bird. Fall, and the net has you. Finish, and the word is yours.'),
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
  'S12-1': line('Gray', 'If that one goes, it takes everyone with it.'),
  'S12-2': line('Sailor', "You don't ask whose fault the hole is. You bail."),
  'S13-1': line('Captain', 'Bail out! Bail her out!'),
  'S14-1': line('Gray', 'They will hate me for this.'),
  'S14-2': line('Gray', 'We will bail out the bank. Not for the bankers. For everyone tied to it.'),
  'S15-1': line('Magpie', 'Not us… not us… not us.'),
  'S15-2': line('Crowd', 'You saved the banks, not us!'),
  'S16-1': line('', "The bank's dry. We're not."),
  'S17-1': line('Gray', 'Nobody knows which of them is rotten. Not even me.'),
  'S17-2': line('Guide', "Never trust a rope you haven't hung on."),
  // The memory's first line (the goal rule: what is to be done, and what is won).
  'S18-0': line('Guide', 'Three pitches to the flag. Test, then trust. The word is yours.'),
  // What the party calls up to her (how it is played, said once each).
  'S18-2': line('Partner', 'Hang on it before we climb it!'),
  'S18-3': line('Partner', 'Keep one hand on. Put your weight on the next!'),
  'S18-4': line('Partner', 'Ice! Get a hand over your head!'),
  'S18-6': line('Partner', 'Try each hold before you hang on it!'),
  'S18-5': line('Partner', 'The storm is on us. Faster!'),
  'S18-1': line('Partner', 'Stress test every one. Then climb.'),
  'S19-1': line('Magpie', 'Mine. Shiny.'),
  'S20-1': line('Gray', 'We will stress test every bank, and show you the results. All of them.'),
  'S20-2': line('Magpie', "They're all rotten… rotten… rotten."),
  'S21-1': line('Gray', "I stopped the fall. They still have no work. I'm out of words."),
  'S21-2': line('Farmer', 'A dry pump gives you nothing. You have to give it water first.'),
  'S22-0': line('Farmer', 'Pour the jug in. Pump hard. Green every row and the word is yours.'),
  'S22-1': line('Husband', "Prime the pump! Then she'll run all day."),
  'S23-1': line('Gray', 'We will prime the pump. Roads, schools, a little in every pocket.'),
  'S23-2': line('Magpie', 'Hide it… hide it… hide it.'),
  'S24-1': line('Banker', 'Prime Minister, the storm is over. No need for fences.'),
  'S24-2': line('Keeper', "Forty years I've kept their bones. Want to know how the last herd was lost?"),
  // The memory's first words say what is to be done and what is won (not in the design's cards).
  'S25-0': line('Elder', 'Ring the herd before the wolves come down. Close it, and the word is yours.'),
  'S25-a': line('Elder', 'Both hands on it. Lift it high, slam it down, till the post shows green.'),
  'S25-b': line('Elder', 'Now the line. Haul it, hand over hand, till the post is green again.'),
  'S25-c': line('Elder', 'Point at the next hole. Go round, and close the ring.'),
  'S25-1': line('Elder', "Ring-fence the herd. What's inside is not for the hunt."),
  'S26-1': line('Speakers', 'Ring-fence.'),
  'S26-2': line('Gray', '…Ring-fence. Your savings on one side. Their bets on the other.'),
  'S27-1': line('Banker', "You'll regret this when the good times come."),
  // This build has four words.
  'S28-1': line('Gray', "I had no words this morning. A bird lent me four. Tomorrow I'll have to find my own."),
  'S28-2': line('Gray', 'Thank you.'),
  'S29-1': line('', 'Time to go home.'),
  'E-G': line('Old man', 'You came back. Good bird.'),
  'E-1': line('', 'Look at it. Every window.'),
  'E-2': line('', 'Most of them made it.'),
  'E-3': line('', 'We kept ours. Not everyone did.'),
  'E-4': line('', "One window. It's a start."),
  'E-M': line('Maya', 'Morning rush. Just like Dad said it would be.'),
  'E-L': line('Leo', 'They never packed a single box.'),
  'E-S': line('Sam', 'Dad retired from that line. Thirty-one years.'),
  'E-N': line('Neighbour', 'Banks first. Always banks first.'),
  'W-0': line('Gray', 'We already have one, bird.'),
  'W-2': line('Gray', "A wall can't stop people who are already running."),
  'W-3': line('Gray', "You can't bail a ship while everyone's pulling the plugs."),
  'W-4': line('Gray', 'Never test the ropes in a storm.'),
  'W-5': line('Gray', "The pump runs. They're hiding every drop."),
  'W-6': line('Gray', "No use fencing a field that's still flooding."),
  'E-T': line('Gray', 'Thank you, bird.'),
} as const satisfies Record<string, Line>;

export type LineId = keyof typeof LINES;

/**
 * The company that buys up the square: "Roost Holdings" in the design is a
 * real company's name, so the shutters show only SOLD; a stand-in name is
 * kept here should one be wanted on the S02 signs (opening.ts).
 */
export const COMPANY = 'HIGHROOST HOLDINGS';

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
  /** The notebook's line after Firewall. */
  lightsOn: 'THE LIGHTS STAY ON',
  sinks: 'GIANT BANK SINKS',
  /** The notebook's line after Bail out: the fight's gold word. */
  afloat: 'BANK AFLOAT',
  /** The notebook's fourth headline (the fog), and its line after Stress test: the fight's gold word. */
  whoIsSafe: 'WHO IS SAFE?',
  fogLifted: 'FOG LIFTED',
  shut: 'FACTORIES SHUT',
  /** The notebook's line after Prime the pump: the fight's gold word. */
  runs: 'WATER RUNS',
  again: 'IT WILL HAPPEN AGAIN',
  /** The notebook's line after Ring-fence: the fight's gold word. */
  fenced: 'SAVINGS FENCED',
} as const;

/** The policy cards' six fields, as the cards print them. */
export interface CardText {
  title: string;
  done: string;
  when: string;
  effect: string;
  cost: string;
  objection: string;
}

export const CARDS: Readonly<Record<'safetyNet' | 'firewall' | 'bailOut' | 'stressTest' | 'primeThePump' | 'ringFence', CardText>> = {
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
  bailOut: {
    title: 'BANKS RESCUED WITH PUBLIC MONEY',
    done: 'The state bought shares in the banks to keep them standing.',
    when: 'In real life: October 2008. $204.9 billion went into 707 banks.',
    effect: "It worked: the banks stood, and their money came back with a gain. The car makers' did not: about $80 billion in, about $70 billion back.",
    cost: 'The price: public anger.',
    objection: '"Why the banks, and not the families losing their homes?"',
  },
  stressTest: {
    title: 'NINETEEN BANKS TESTED IN PUBLIC',
    done: 'Every big bank was tested, and the results were shown to everyone.',
    when: 'In real life: 7 May 2009. Ten of nineteen banks were told to raise $74.6 billion.',
    effect: 'It worked: they raised it, and trust came back.',
    cost: 'The price: the weak were named in public.',
    objection: '"The test was too easy."',
  },
  primeThePump: {
    title: 'RATES CUT TO ZERO. $787 BILLION SPENT',
    done: 'The state made borrowing almost free, then spent to get work moving.',
    when: 'In real life: 16 December 2008 and 17 February 2009.',
    effect: 'It worked: the recession ended in June 2009. Unemployment still peaked at 10% that October.',
    cost: 'The price: public debt rose from 40% to 62% of the economy by 2010.',
    objection: '"Too big," said some. "Too small," said others.',
  },
  ringFence: {
    title: 'SAVINGS KEPT APART FROM BETS',
    done: 'Banks must keep everyday savings on one side, and their own bets on the other.',
    when: 'In real life: the word is British. Law passed in 2013, in force 1 January 2019. The United States chose a different rule in 2010.',
    effect: 'Has it worked? Not yet tested by a crisis that size.',
    cost: 'The price: banks say it costs them, and their customers.',
    objection: '"It makes banking dearer."',
  },
};

/** The boss fights' names and the gold words when won. */
export const BOSSES = {
  run: { name: 'THE RUN', won: 'PANIC CALMED' },
  coldFire: { name: 'THE COLD FIRE', won: 'FIRE CONTAINED' },
  sinkingBank: { name: 'THE SINKING BANK', won: 'BANK AFLOAT' },
  fog: { name: 'THE FOG', won: 'FOG LIFTED' },
  drought: { name: 'THE DROUGHT', won: 'WATER RUNS' },
  wolves: { name: 'THE WOLVES', won: 'SAVINGS FENCED' },
} as const;

/** The words, as the feathers and Gray's balloon show them. */
export const WORDS = {
  freshBread: 'Fresh bread',
  safetyNet: 'Safety net',
  firewall: 'Firewall',
  bailOut: 'Bail out',
  stressTest: 'Stress test',
  primeThePump: 'Prime the pump',
  ringFence: 'Ring-fence',
} as const;

/** The credits' lines (S31), the ones the first part can show. */
export const CREDITS = {
  safetyNet: 'Safety net. Deposit insurance, 2008.',
  /** "The other five from the card headings, the same way" (S31): Firewall's card heading. */
  firewall: 'Firewall. State stands behind bank debt, 2008.',
  bailOut: 'Bail out. Banks rescued with public money, 2008.',
  stressTest: 'Stress test. Nineteen banks tested in public, 2009.',
  primeThePump: 'Prime the pump. Rates cut to zero. $787 billion spent, 2009.',
  ringFence: 'Ring-fence. Savings kept apart from bets, 2013.',
  secondTry: 'In real life, nobody got a second try.',
  simplified: 'Simplified. Based mainly on the United States, 2008–2010; ring-fencing is British.',
} as const;
