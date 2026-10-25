// Compact offline word-frequency data keeps suggestions immediate and usable
// without network access. Frequencies are relative weights, not corpus counts.
const WORD_FREQUENCIES: Readonly<Record<string, number>> = {
  the: 1000, you: 980, i: 960, to: 940, a: 920, and: 900, it: 880,
  is: 860, in: 840, that: 820, was: 800, for: 780, my: 760, we: 740,
  me: 720, this: 700, have: 680, can: 660, do: 640, want: 620,
  need: 600, please: 580, help: 560, yes: 540, no: 520, thank: 500,
  thanks: 480, good: 460, not: 440, on: 420, with: 400, love: 380,
  like: 360, go: 340, am: 320, are: 300, be: 280, he: 260, she: 240,
  they: 220, hello: 200, today: 190, water: 180, home: 170, food: 160,
  tired: 150, happy: 140, sorry: 130, doctor: 120, call: 110, stop: 100,
  bathroom: 95, pain: 90, cold: 85, hot: 80, family: 75, more: 70,
  finished: 65, comfortable: 60, medicine: 55, thirsty: 50,
};

/** Likely continuations after a word, best first. */
const NEXT_WORDS: Readonly<Record<string, readonly string[]>> = {
  i: ['am', 'want', 'need'],
  you: ['are', 'can', 'have'],
  we: ['are', 'can', 'want'],
  need: ['help', 'to', 'water'],
  want: ['to', 'water', 'food'],
  thank: ['you'],
  thanks: ['you'],
  good: ['morning', 'to', 'thank'],
  please: ['help', 'call', 'stop'],
  am: ['tired', 'happy', 'in'],
  have: ['pain', 'a', 'the'],
  my: ['family', 'doctor', 'name'],
};

export const MAX_PREDICTIONS = 3;

const byFrequencyDesc = (left: string, right: string) =>
  (WORD_FREQUENCIES[right] ?? 0) - (WORD_FREQUENCIES[left] ?? 0);

/**
 * Suggests up to {@link MAX_PREDICTIONS} words.
 *
 * With a typed `prefix`, returns the most frequent words starting with it.
 * With no prefix, returns likely continuations of `previousWord`, topped up
 * with the most frequent words overall so the row never collapses.
 */
export function getPredictions(prefix: string, previousWord: string): string[] {
  const normalizedPrefix = prefix.toLowerCase();
  const allWords = Object.keys(WORD_FREQUENCIES);

  if (normalizedPrefix) {
    return allWords
      .filter((word) => word.startsWith(normalizedPrefix))
      .sort(byFrequencyDesc)
      .slice(0, MAX_PREDICTIONS);
  }

  const continuations = NEXT_WORDS[previousWord.toLowerCase()] ?? [];
  const topUp = [...allWords].sort(byFrequencyDesc);
  return [...new Set([...continuations, ...topUp])].slice(0, MAX_PREDICTIONS);
}
