/**
 * Measure a document: every number Legible reports is computed here.
 *
 * The pipeline has two steps so that transforms can sit in between:
 *
 *   segmentDocument(doc)   paragraphs → sentences (as plain strings)
 *   measure(segmented)     sentences → tokens, syllables, scores and totals
 */

import { findPassive } from './passive.js';
import { splitSentences, tokenize, usesLowercaseSentences } from './segment.js';
import { countSyllables } from './syllables.js';
import { isCommon } from './words.js';

/** The thresholds Legible flags against. Sources are listed in src/core/sources.js. */
export const LIMITS = {
  /** GOV.UK: "if you have sentences longer than 25 words, try to break them up". */
  sentence: 25,
  /** Our second line: past 35 words a sentence is flagged as very long. */
  verySentence: 35,
  /** Our rule of thumb for one paragraph. No standard sets this number. */
  paragraph: 150,
  /** Flesch-Kincaid counterfactuals: what if sentences and words were plain? */
  plainSentence: 15,
  plainSyllables: 1.5,
  /** Reading-time estimate, words per minute. A round number, not a measurement. */
  wordsPerMinute: 200,
};

const MEASURED = new Set(['paragraph', 'list', 'quote']);
const isUpper = (s) => /^\p{Lu}/u.test(s);
const isAllCaps = (s) => /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s);
const letterCount = (s) => (s.match(/\p{L}/gu) || []).length;

/**
 * @param {{ blocks: import('./parse.js').Block[] }} doc
 * @returns the same document with `sentences: [{ id, text }]` on every block
 */
export function segmentDocument(doc) {
  const lowercase = usesLowercaseSentences(doc.blocks.filter((b) => MEASURED.has(b.type)).map((b) => b.text));
  return {
    ...doc,
    blocks: doc.blocks.map((block, b) => {
      let texts;
      if (block.type === 'pre') texts = [];
      else if (MEASURED.has(block.type)) texts = splitSentences(block.text, { lowercase });
      else texts = [block.text];
      return { ...block, id: b, sentences: texts.map((text, s) => ({ id: `${b}:${s}`, text })) };
    }),
  };
}

/** Tokenise one sentence and work out how each token should be counted. */
function readSentence(text) {
  const tokens = tokenize(text);
  const long = tokens.filter((t) => t.kind === 'word' && letterCount(t.text) > 1);
  // A WHOLE SENTENCE IN CAPITALS is emphasis, not a row of acronyms.
  const shouting = long.length >= 3 && long.filter((t) => isAllCaps(t.text)).length / long.length >= 0.6;

  let seenWord = false;
  for (const t of tokens) {
    t.counts = t.kind === 'word' || t.kind === 'number' || t.kind === 'abbr';
    if (t.kind === 'word') {
      const letters = letterCount(t.text);
      t.latin = /^[\p{Script=Latin}\p{N}'’ʼ\-‐‑]+$/u.test(t.text);
      t.acronym = !shouting && letters > 1 && letters <= 5 && isAllCaps(t.text);
      // Short initialisms are read letter by letter (FBI). Longer ones with a vowel are said as words (NASA).
      const spelled = t.acronym && (letters <= 3 || !/[AEIOUY]/.test(t.text));
      t.syllables = t.latin ? Math.max(1, countSyllables(t.text, { acronym: spelled })) : 1;
      t.capital = !shouting && isUpper(t.text);
      t.initial = !seenWord;
      seenWord = true;
    } else if (t.counts) {
      t.syllables = Math.max(1, countSyllables(t.text));
    }
  }
  return tokens;
}

/** "state-of-the-art" is everyday if each part is. Parts of one or two letters are ignored. */
function isEveryday(word) {
  for (const part of word.split(/[-‐‑]/)) {
    if (letterCount(part) >= 3 && !isCommon(part)) return false;
  }
  return true;
}

/**
 * @param {ReturnType<typeof segmentDocument>} doc
 * @returns the document with measured sentences, plus `totals`
 */
export function measure(doc) {
  const blocks = doc.blocks.map((block) => ({
    ...block,
    measured: MEASURED.has(block.type),
    sentences: block.sentences.map((sentence) => ({ ...sentence, tokens: readSentence(sentence.text) })),
  }));
  const measuredSentences = blocks.filter((b) => b.measured).flatMap((b) => b.sentences);

  // Names. A capital in mid-sentence marks one. At the start of a sentence every word has
  // a capital, so there it counts as a name only if the text uses it as one elsewhere.
  const lowerSeen = new Set();
  const capitalInside = new Set();
  for (const sentence of measuredSentences) {
    for (const t of sentence.tokens) {
      if (t.kind !== 'word') continue;
      const key = t.text.toLowerCase();
      if (!isUpper(t.text)) lowerSeen.add(key);
      else if (t.capital && !t.initial) capitalInside.add(key);
    }
  }

  const rareCounts = new Map();
  const totals = {
    words: 0,
    sentences: 0,
    syllables: 0,
    lexical: 0,
    everyday: 0,
    rare: 0,
    polysyllables: 0,
    lengths: [],
    over: 0,
    wayOver: 0,
    longest: 0,
    wordsInLong: 0,
    paragraphs: 0,
    longParagraphs: 0,
    longestParagraph: 0,
    wordsInLongParagraphs: 0,
    passiveSentences: 0,
  };

  for (const block of blocks) {
    block.words = 0;
    for (const sentence of block.sentences) {
      let words = 0;
      let syllables = 0;
      let rare = 0;
      for (const t of sentence.tokens) {
        if (!t.counts) continue;
        words++;
        syllables += t.syllables;
        if (t.kind !== 'word' || !block.measured) continue;
        if (t.syllables >= 3) totals.polysyllables++;
        const key = t.text.toLowerCase();
        t.name = t.capital && (!t.initial || (capitalInside.has(key) && !lowerSeen.has(key)));
        if (!t.latin || t.name || t.acronym || /\p{N}/u.test(t.text) || letterCount(t.text) < 3) continue;
        totals.lexical++;
        if (isEveryday(t.text)) {
          totals.everyday++;
        } else {
          t.rare = true;
          rare++;
          rareCounts.set(key, (rareCounts.get(key) || 0) + 1);
        }
      }
      sentence.words = words;
      sentence.syllables = syllables;
      sentence.rare = rare;
      block.words += words;
      if (!block.measured || !words) continue;

      sentence.passive = findPassive(sentence.text, sentence.tokens);
      sentence.long = words > LIMITS.sentence;
      sentence.veryLong = words > LIMITS.verySentence;
      totals.words += words;
      totals.syllables += syllables;
      totals.sentences++;
      totals.rare += rare;
      totals.lengths.push(words);
      totals.longest = Math.max(totals.longest, words);
      if (sentence.long) {
        totals.over++;
        totals.wordsInLong += words;
      }
      if (sentence.veryLong) totals.wayOver++;
      if (sentence.passive.length) totals.passiveSentences++;
    }
    if (!block.measured || !block.words) continue;
    block.long = block.words > LIMITS.paragraph;
    totals.paragraphs++;
    totals.longestParagraph = Math.max(totals.longestParagraph, block.words);
    if (block.long) {
      totals.longParagraphs++;
      totals.wordsInLongParagraphs += block.words;
    }
  }

  const { words, sentences, syllables } = totals;
  totals.wordsPerSentence = sentences ? words / sentences : 0;
  totals.syllablesPerWord = words ? syllables / words : 0;
  // Flesch (1948) and Kincaid et al. (1975). Both need at least one sentence and one word.
  totals.ease = sentences ? 206.835 - 1.015 * totals.wordsPerSentence - 84.6 * totals.syllablesPerWord : null;
  totals.grade = sentences ? 0.39 * totals.wordsPerSentence + 11.8 * totals.syllablesPerWord - 15.59 : null;
  // How much of the grade each half of the formula accounts for, against plain writing.
  totals.gradeFromSentences = sentences ? 0.39 * (totals.wordsPerSentence - LIMITS.plainSentence) : 0;
  totals.gradeFromWords = sentences ? 11.8 * (totals.syllablesPerWord - LIMITS.plainSyllables) : 0;
  totals.rareShare = totals.lexical ? totals.rare / totals.lexical : 0;
  totals.everydayShare = totals.lexical ? totals.everyday / totals.lexical : 1;
  totals.polysyllableShare = words ? totals.polysyllables / words : 0;
  totals.minutes = words / LIMITS.wordsPerMinute;
  totals.rareWords = [...rareCounts]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));

  return { ...doc, blocks, totals };
}

/** Sentence-length histogram: how many sentences fall in each band. */
export function lengthBands(lengths) {
  const bands = [
    { label: '1–10', max: 10 },
    { label: '11–15', max: 15 },
    { label: '16–20', max: 20 },
    { label: '21–25', max: 25 },
    { label: '26–35', max: 35, long: true },
    { label: '36+', max: Infinity, long: true, veryLong: true },
  ].map((band) => ({ ...band, count: 0 }));
  for (const n of lengths) bands.find((band) => n <= band.max).count++;
  return bands;
}
