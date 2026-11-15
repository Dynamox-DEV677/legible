/**
 * Parsers for the two upstream datasets Legible is built and tested against.
 * Both are treated as plain data: nothing in them is ever executed.
 */

/**
 * CMU Pronouncing Dictionary → Map<word, Set<syllable count>>.
 * A line looks like `tomato T AH0 M EY1 T OW2` or `tomato(2) T AH0 M AA1 T OW2`.
 * Every vowel sound carries a stress digit, so counting digits counts syllables.
 */
export function loadCmuSyllables(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith(';;;')) continue;
    const body = line.split(' #')[0];
    const space = body.indexOf(' ');
    if (space < 1) continue;
    const word = body.slice(0, space).replace(/\(\d+\)$/, '');
    if (!/^[a-z]+$/.test(word)) continue;
    const syllables = (body.slice(space).match(/\d/g) || []).length;
    if (!syllables) continue;
    if (!map.has(word)) map.set(word, new Set());
    map.get(word).add(syllables);
  }
  return map;
}

/**
 * Does a syllable count agree with the dictionary?
 *
 * One family is deliberately lenient. CMUdict writes "tired", "fire" and "hour" as two
 * syllables (TAY-erd). Most dictionaries accept one, and one is what a reader hears, so
 * for words built on -ire-, -yre- and -our- a count one lower than CMUdict's also passes.
 */
export function agrees(word, got, truth) {
  if (truth.has(got)) return true;
  return /ire|yre|our/.test(word) && truth.has(got + 1);
}

/**
 * A `word count` per line frequency list → [{ word, count }] in the order given.
 * Keeps plain lower-case words only. Single letters other than "a" and "i" are the
 * leftovers of split contractions ("don" + "t") and are dropped.
 */
export function loadFrequencyList(text) {
  const out = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    const [raw, n] = line.trim().split(/\s+/);
    if (!raw) continue;
    const word = raw.toLowerCase();
    if (!/^[a-z]+$/.test(word) || seen.has(word)) continue;
    if (word.length === 1 && word !== 'a' && word !== 'i') continue;
    seen.add(word);
    out.push({ word, count: Number(n) || 1 });
  }
  return out;
}
