/**
 * Tokens and sentences.
 *
 * Splitting on full stops gets English wrong within a paragraph: "Dr. Rao paid $3.50 at
 * 5 p.m. in the U.S. and left." is one sentence with six full stops. This module finds
 * the places where a sentence could end, then decides each one from the word before the
 * stop and the word after it.
 */

/** Wraps inline code in the text so the tokenizer can keep it out of the word counts. */
export const CODE_OPEN = '';
export const CODE_CLOSE = '';

const TOKEN_SOURCE = [
  '([^]*)', // 1 code
  String.raw`((?:https?:\/\/|www\.)[^\s<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)`, // 2 link or email
  String.raw`(\[\d{1,3}\])`, // 3 footnote mark: [12]
  String.raw`(\d+(?:[.,]\d+)*(?:(?:st|nd|rd|th|s)(?![\p{L}\p{N}]))?)`, // 4 number: 3.5, 1,000, 2nd, 1990s
  String.raw`((?:\p{L}\.){2,})`, // 5 initialism: U.S., e.g., p.m.
  String.raw`(\p{L}[\p{L}\p{N}]*(?:['’ʼ\-‐‑][\p{L}\p{N}]+)*)`, // 6 word: don't, well-being
].join('|');

/**
 * Only 'word', 'number' and 'abbr' count as words. Links, code and footnote marks are
 * kept as tokens so they can be shown, but they are not read as vocabulary.
 *
 * @typedef {{ text: string, start: number, end: number, kind: 'word'|'number'|'abbr'|'link'|'code'|'note' }} Token
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenize(text) {
  const re = new RegExp(TOKEN_SOURCE, 'gu');
  const tokens = [];
  let m;
  while ((m = re.exec(text))) {
    let value = m[0];
    const kind = m[1] ? 'code' : m[2] ? 'link' : m[3] ? 'note' : m[4] ? 'number' : m[5] ? 'abbr' : 'word';
    if (kind === 'link') {
      // A link at the end of a sentence must not swallow the full stop.
      const trimmed = value.replace(/[.,;:!?)\]'"]+$/, '');
      if (trimmed.length !== value.length) {
        value = trimmed;
        re.lastIndex = m.index + value.length;
      }
    }
    tokens.push({ text: value, start: m.index, end: m.index + value.length, kind });
  }
  return tokens;
}

/* ------------------------------------------------------------------------------------
 * Abbreviations
 * ---------------------------------------------------------------------------------- */

const set = (words) => new Set(words.split(' '));

/** Titles go before a name, so the stop after one never ends a sentence: "Dr. Rao". */
const TITLES = set('mr mrs ms mx dr prof rev hon sen rep gov gen col capt lt sgt cmdr cpl maj pres supt messrs mme mlle fr mt ft');
/** These lead into something else: "vs. the rest", "e.g. this one". */
const NEVER_FINAL = set('vs cf viz approx ca dept univ assn bros est eg ie esp incl excl e.g i.e ph');
/** Reference labels, abbreviations only when a number follows: "No. 5", "p. 12", "Fig. 3". */
const BEFORE_NUMBER = set('no nos fig figs eq eqs sec secs ch vol vols pp p para paras art arts cl pt nr');
/** May or may not end the sentence: "Acme Inc. The firm…" against "Acme Inc. shares…". */
const SOMETIMES_FINAL = set('inc ltd co corp llc plc jr sr st ave blvd rd jan feb mar apr jun jul aug sep sept oct nov dec mon tue tues wed thu thur thurs fri sat sun');
/**
 * Words that often open a sentence. After an abbreviation that might or might not end
 * one, a capital letter is not enough ("U.S. Government" is mid-sentence), but a
 * capitalised word from this list is ("the U.S. The law…").
 */
const STARTERS = set(
  'the a an this that these those it he she they we i you there here in on at for from with by as if when while ' +
    'although though because since after before but and or so yet however therefore thus then now also still ' +
    'meanwhile moreover furthermore instead what why how who where which whose our my his her their its your ' +
    'some many most all each every no not both several one two other another such to under over during until ' +
    'once unless despite please let do does did is are was were can could should would have has had',
);

const isUpper = (s) => /^\p{Lu}/u.test(s);

/**
 * Decide whether the stop between two tokens ends a sentence.
 * @param {Token} prev the token before the stop
 * @param {string} term the stop itself: ".", "?", "!", "..." or a run of them
 * @param {Token} next the token after it
 * @param {{ lowercase: boolean, before: string }} context whether this text starts its
 *   sentences in lower case, and the lower-cased token before `prev`
 */
function endsSentence(prev, term, next, { lowercase, before }) {
  const nextUpper = isUpper(next.text);
  const nextNumber = next.kind === 'number';
  const starter = nextUpper && STARTERS.has(next.text.toLowerCase());

  // "Why?" she asked. A lower-case word after ? or ! carries the sentence on.
  if (/[!?]/.test(term)) return nextUpper || nextNumber || lowercase;
  // An ellipsis trails off more often than it ends: "Well... I think so."
  if (term.length > 1 || term === '…') return nextUpper && !/^I(?:['’]|$)/.test(next.text);

  const key = prev.text.toLowerCase().replace(/\.$/, '');
  if (prev.kind === 'abbr') return !NEVER_FINAL.has(key) && starter; // U.S., p.m., e.g.
  if (prev.kind === 'word') {
    const capital = isUpper(prev.text);
    if (prev.text.length === 1 && capital && prev.text !== 'I') return starter; // J. K. Rowling, Plan B. Then…
    if (NEVER_FINAL.has(key)) return false;
    if (BEFORE_NUMBER.has(key) && nextNumber) return false;
    if (capital && TITLES.has(key)) return false;
    if (key === 'al' && before === 'et') return starter; // et al.
    if (capital && SOMETIMES_FINAL.has(key)) return !nextNumber && starter; // Jan. 5 / Acme Inc. The…
    if (key === 'etc') return nextUpper || nextNumber;
  }
  if (nextUpper || nextNumber) return true;
  // A lower-case word next: an abbreviation we do not know, unless this writer never capitalises.
  return lowercase;
}

/* ------------------------------------------------------------------------------------
 * Sentences
 * ---------------------------------------------------------------------------------- */

const CLOSER = String.raw`["'”’»)\]]`;
const OPENERS = String.raw`["'“‘«(\[¿¡]*`;
/** closers, the stop, closers or a footnote mark, white space, openers: `." [3] "` */
const STOP_GAP = new RegExp(`^(${CLOSER}*)([.!?\\u2026]+)((?:${CLOSER}|\\[\\d{1,3}\\])*)(\\s+)${OPENERS}$`, 'u');
/** After an initialism the stop is already inside the token: `U.S. The` */
const SPACE_GAP = new RegExp(`^(${CLOSER}*)(\\s+)${OPENERS}$`, 'u');

/**
 * Split one paragraph into sentences.
 * @param {string} text a paragraph with single spaces and no line breaks
 * @param {{ lowercase?: boolean }} [options] see usesLowercaseSentences()
 * @returns {string[]}
 */
export function splitSentences(text, { lowercase = false } = {}) {
  // Footnote marks sit between a full stop and the next sentence: "It ended.[1] A new…".
  // Leaving them out here lets the stop and the mark be read as one gap.
  const tokens = tokenize(text).filter((t) => t.kind !== 'note');
  const sentences = [];
  let start = 0; // where the current sentence begins in the text
  let first = 0; // index of its first token

  for (let i = 0; i < tokens.length - 1; i++) {
    const prev = tokens[i];
    const next = tokens[i + 1];
    const gap = text.slice(prev.end, next.start);

    let term;
    let tail; // punctuation that stays with the sentence that is ending
    let space;
    let m = STOP_GAP.exec(gap);
    if (m) {
      term = m[2];
      tail = m[1].length + m[2].length + m[3].length;
      space = m[4].length;
    } else if (prev.kind === 'abbr' && (m = SPACE_GAP.exec(gap))) {
      term = '.';
      tail = m[1].length;
      space = m[2].length;
    } else {
      continue;
    }

    // A list label is not a sentence: "1. Sign the form." / "a. Then post it."
    if (i === first && (prev.kind === 'number' || /^(?:\p{L}|[ivx]{2,4})$/iu.test(prev.text))) continue;
    const before = i > first ? tokens[i - 1].text.toLowerCase() : '';
    if (!endsSentence(prev, term, next, { lowercase, before })) continue;

    const end = prev.end + tail;
    sentences.push(text.slice(start, end).trim());
    start = end + space;
    first = i + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

/**
 * Some people write without capital letters: "got home late. didn't eat." For that
 * style, a lower-case word after a stop has to count as a new sentence.
 * @param {string[]} paragraphs
 */
export function usesLowercaseSentences(paragraphs) {
  let lower = 0;
  let upper = 0;
  for (const text of paragraphs) {
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length - 1; i++) {
      const prev = tokens[i];
      if (prev.kind !== 'word' || prev.text.length < 3) continue; // skip likely abbreviations
      if (!/^\.\s+$/.test(text.slice(prev.end, tokens[i + 1].start))) continue;
      const key = prev.text.toLowerCase();
      if (NEVER_FINAL.has(key) || TITLES.has(key) || SOMETIMES_FINAL.has(key) || key === 'etc') continue;
      if (isUpper(tokens[i + 1].text)) upper++;
      else if (tokens[i + 1].kind === 'word') lower++;
    }
  }
  return lower >= 3 && lower > upper * 2;
}
