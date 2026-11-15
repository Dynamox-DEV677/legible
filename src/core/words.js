/**
 * Is this an everyday word?
 *
 * Legible bundles the 5,000 word forms that turn up most often in film and television
 * subtitles, plus a short list of screen-era words (see data/README.md for sources and
 * licences). Subtitles are speech, so a word missing from this list is one people rarely
 * hear said aloud, which is a fair signal that a struggling reader may not know it.
 *
 * The lookup understands ordinary grammar: if "walk" is on the list then "walks",
 * "walked", "walking" and "walker" count as everyday words too. That is also why the
 * bundled list is smaller than 5,000 entries: forms the lookup can work out for itself
 * are left out at build time, and the build proves that nothing was lost.
 */

import { COMMON_WORDS } from './data/common-words.js';

let cache = null;

/**
 * The list is stored front-coded: each entry is a digit (how many leading letters to
 * keep from the previous word) followed by the letters that differ. "0able1bout" decodes
 * to "able", "about". Sorted words share long prefixes, so this roughly halves the size.
 */
export function decodeWordList(encoded) {
  const set = new Set();
  let previous = '';
  for (const match of encoded.matchAll(/(\d)([a-z]*)/g)) {
    previous = previous.slice(0, Number(match[1])) + match[2];
    set.add(previous);
  }
  return set;
}

export function encodeWordList(words) {
  let out = '';
  let previous = '';
  for (const word of [...words].sort()) {
    let shared = 0;
    while (shared < 9 && shared < previous.length && shared < word.length && previous[shared] === word[shared]) shared++;
    out += shared + word.slice(shared);
    previous = word;
  }
  return out;
}

const list = () => (cache ??= decodeWordList(COMMON_WORDS));

/**
 * The words a regular English ending could have been built from. "stopped" could come
 * from "stopp", "stoppe" or "stop"; only one of those is a word, and the caller checks.
 * One step only: "walkers" yields "walker", not "walk".
 */
export function baseForms(w) {
  const out = [];
  const n = w.length;
  const cut = (k, add = '') => {
    if (n - k >= 2) out.push(w.slice(0, n - k) + add);
  };
  const undouble = (k) => {
    if (n - k >= 3 && w[n - k - 1] === w[n - k - 2]) out.push(w.slice(0, n - k - 1));
  };

  if (w.endsWith('s') && !w.endsWith('ss')) {
    cut(1); // makes → make, cars → car
    if (w.endsWith('es')) cut(2); // boxes → box
    if (w.endsWith('ies')) cut(3, 'y'); // cities → city
    if (w.endsWith('ves')) cut(3, 'f'), cut(3, 'fe'); // leaves → leaf, knives → knife
  }
  if (w.endsWith('ed')) {
    cut(1); // liked → like
    cut(2); // walked → walk
    undouble(2); // stopped → stop
    if (w.endsWith('ied')) cut(3, 'y'); // tried → try
  }
  if (w.endsWith('ing')) {
    cut(3); // walking → walk
    cut(3, 'e'); // making → make
    undouble(3); // running → run
    if (w.endsWith('ying')) cut(4, 'ie'); // dying → die
  }
  if (w.endsWith('er')) {
    cut(1); // nicer → nice
    cut(2); // faster → fast
    undouble(2); // bigger → big
    if (w.endsWith('ier')) cut(3, 'y'); // happier → happy
  }
  if (w.endsWith('est')) {
    cut(2); // nicest → nice
    cut(3); // fastest → fast
    undouble(3); // biggest → big
    if (w.endsWith('iest')) cut(4, 'y'); // happiest → happy
  }
  if (w.endsWith('ly')) {
    cut(2); // quickly → quick
    cut(1); // fully → full
    cut(1, 'e'); // simply → simple
    cut(2, 'e'); // truly → true
    if (w.endsWith('ily')) cut(3, 'y'); // happily → happy
    if (w.endsWith('ally')) cut(4); // basically → basic
  }
  return out;
}

/** Contractions whose first half is not a word on its own. */
const IRREGULAR_CONTRACTIONS = new Set(["can't", "won't", "shan't", "ain't", "let's", "o'clock", "y'all", "ma'am"]);

/**
 * @param {string} word one word as written; capitals, accents and apostrophes are fine
 * @returns {boolean} true if it is one of the everyday words, or a regular form of one
 */
export function isCommon(word) {
  let w = String(word)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase()
    .replace(/^'+|'+$/g, '');
  if (!w) return true;
  const words = list();
  if (words.has(w) || IRREGULAR_CONTRACTIONS.has(w)) return true;

  if (w.includes("'")) {
    // "didn't" → "did", "they've" → "they", "Maria's" → "maria"
    w = w.replace(/(?:n't|'(?:ve|ll|re|d|m|s))$/, '').replace(/'/g, '');
    if (!w || words.has(w)) return true;
  }
  for (const base of baseForms(w)) if (words.has(base)) return true;
  return false;
}

/** How many entries are stored, after the build removed the forms it can work out. */
export const storedWordCount = () => list().size;
