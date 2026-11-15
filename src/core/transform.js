/**
 * The two fixes that change the text on screen.
 *
 * splitSentence() breaks a long sentence at a clause boundary. It keeps one promise that
 * the tests enforce on every sample: THE SAME WORDS, IN THE SAME ORDER. Only punctuation
 * and capital letters change. It never adds, drops or reorders a word, so the reader can
 * trust that nothing was rewritten. It does not promise that the pieces read exactly as
 * the original did, which is why the original is always kept alongside.
 *
 * chunkSizes() decides where to break a long paragraph. That changes white space only.
 */

import { LIMITS } from './measure.js';
import { tokenize } from './segment.js';

const set = (words) => new Set(words.split(' '));

/** A piece shorter than this is more likely a list item than a clause. */
const MIN_PIECE = 6;

const COORDINATORS = set('and but or so yet nor');
/** After a conjunction these almost always start a clause of their own: ", and they left". */
const SUBJECT_PRONOUNS = set('i you he she it we they there');
/** After a conjunction these carry on the clause before: ", and that …", ", or to …". */
const CONTINUES = set('that which who whom whose whether to if when where while because as than then also');
const RELATIVISERS = set('that which who whom whose where');
/** A verb we can recognise without a parser. Finding one means the piece has its own verb. */
const AUXILIARIES = set(
  "is are was were am be has have had do does did will would shall should can could may might must cannot " +
    "isn't aren't wasn't weren't hasn't haven't hadn't don't doesn't didn't won't wouldn't shouldn't can't couldn't",
);
/** How far past a conjunction to look for that verb. Subjects can be long: "applications sent by post". */
const VERB_WINDOW = 12;
/** Splitting before these leaves a fragment ("Which means…"). Used only as a last resort. */
const RELATIVES = set('which who whose where');
const SUBORDINATORS = set('because although though whereas while unless');
const TWO_WORD_SUBORDINATORS = set('so_that provided_that except_that even_though');

const counts =(t) => t.kind === 'word' || t.kind === 'number' || t.kind === 'abbr';

/** @param {string} text @returns {number} words as the readability formulas count them */
export const countWords = (text) => tokenize(text).filter(counts).length;

/**
 * Every place this sentence could be cut, with how safe the cut is (3 safest).
 * `at` is the index of the token that would start the new sentence.
 */
function findCuts(text, tokens) {
  const cuts = [];
  const lower = tokens.map((t) => t.text.toLowerCase());
  const wordsUntilComma = (from) => {
    // How many words follow before the next comma, or Infinity if there is none.
    let n = 0;
    for (let j = from; j < tokens.length; j++) {
      if (j > from && text.slice(tokens[j - 1].end, tokens[j].start).includes(',')) return n;
      if (counts(tokens[j])) n++;
    }
    return Infinity;
  };
  /**
   * Does a clause that can stand alone start at token j? Without a parser the test has to
   * be strict, because the alternative is cutting a list in half ("the use of, or the
   * inability to use, the Service"). It passes only when the piece opens with a subject
   * pronoun, or when a subject is followed by a verb we can recognise before any comma or
   * relative clause gets in the way.
   */
  const opensClause = (j) => {
    if (j >= tokens.length || tokens[j].kind !== 'word' || CONTINUES.has(lower[j])) return false;
    if (SUBJECT_PRONOUNS.has(lower[j])) return true;
    if (AUXILIARIES.has(lower[j])) return false; // ", and is liable": a verb with no subject of its own
    for (let k = j + 1; k < tokens.length && k < j + VERB_WINDOW; k++) {
      if (/[,;:()]/.test(text.slice(tokens[k - 1].end, tokens[k].start)) || RELATIVISERS.has(lower[k])) return false;
      if (AUXILIARIES.has(lower[k].replace(/’/g, "'"))) return true;
    }
    return false;
  };

  const dashGaps = [];
  let depth = 0; // inside brackets
  let quoted = false; // inside double quotation marks
  for (let i = 1; i < tokens.length; i++) {
    const gapStart = tokens[i - 1].end;
    const gap = text.slice(gapStart, tokens[i].start);
    for (const ch of gap) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
      else if (ch === '"') quoted = !quoted;
      else if (ch === '“') quoted = true;
      else if (ch === '”') quoted = false;
    }
    if (depth || quoted) continue;
    const cut = (priority, at = i) => cuts.push({ at, priority, from: gapStart, to: tokens[at].start });

    if (/^;\s+$/.test(gap)) {
      cut(3); // two full clauses, already marked as such by the writer
    } else if (/^,\s+$/.test(gap)) {
      if (COORDINATORS.has(lower[i]) && opensClause(i + 1)) cut(2); // ", and she …"
      else if (RELATIVES.has(lower[i]) && wordsUntilComma(i) === Infinity) cut(1); // ", which …" to the end
      else if (
        (SUBORDINATORS.has(lower[i]) || TWO_WORD_SUBORDINATORS.has(`${lower[i]}_${lower[i + 1]}`)) &&
        wordsUntilComma(i) >= MIN_PIECE
      ) {
        cut(1); // ", because …" as long as it is not a short aside between commas
      }
    } else if (/^:\s+$/.test(gap)) {
      if (opensClause(i) && wordsUntilComma(i) > 5) cut(2); // a clause follows, not a list
    } else if (/^(?:\s+[—–-]\s+|—)$/.test(gap)) {
      dashGaps.push(i);
    }
  }
  // One dash joins two clauses. Two dashes fence off an aside, which must stay put.
  if (dashGaps.length === 1 && opensClause(dashGaps[0])) {
    const i = dashGaps[0];
    cuts.push({ at: i, priority: 2, from: tokens[i - 1].end, to: tokens[i].start });
  }
  return cuts;
}

/**
 * Break a long sentence into shorter ones at clause boundaries.
 *
 * @param {string} text one sentence
 * @param {number} [limit] sentences at or under this many words are left alone
 * @returns {string[]} one or more sentences; a single entry means it was not split
 */
export function splitSentence(text, limit = LIMITS.sentence) {
  const tokens = tokenize(text);
  const before = [0]; // before[i] = words among tokens[0..i)
  for (const t of tokens) before.push(before[before.length - 1] + (counts(t) ? 1 : 0));
  const words = (a, b) => before[b] - before[a];
  if (words(0, tokens.length) <= limit) return [text];

  const cuts = findCuts(text, tokens);
  const chosen = [];
  const pieces = [[0, tokens.length]]; // token ranges still to consider
  while (pieces.length) {
    const [a, b] = pieces.pop();
    if (words(a, b) <= limit) continue;
    let best = null;
    for (const c of cuts) {
      if (c.at <= a || c.at >= b) continue;
      const left = words(a, c.at);
      const right = words(c.at, b);
      if (left < MIN_PIECE || right < MIN_PIECE) continue;
      const score = c.priority * 1000 - Math.abs(left - right); // safest cut first, then the most even
      if (!best || score > best.score) best = { ...c, score };
    }
    if (!best) continue;
    chosen.push(best);
    pieces.push([a, best.at], [best.at, b]);
  }
  if (!chosen.length) return [text];
  chosen.sort((x, y) => x.at - y.at);

  const out = [];
  let start = 0;
  for (const c of [...chosen, null]) {
    let piece = text.slice(start, c ? c.from : text.length).trim();
    if (c) piece += '.';
    out.push(piece);
    if (c) start = c.to;
  }
  // Give each new sentence its capital letter. Tokens other than words (numbers, links,
  // code) are left exactly as written.
  return out.map((piece, i) => {
    if (i === 0) return piece;
    const first = tokenize(piece)[0];
    if (!first || first.kind !== 'word' || first.start !== 0) return piece;
    return piece[0].toUpperCase() + piece.slice(1);
  });
}

/* ------------------------------------------------------------------------------------
 * Paragraphs
 * ---------------------------------------------------------------------------------- */

/** A sentence that opens like this often starts a new thought, so it is a good place to break. */
const TURN = /^(?:however|but|yet|in addition|additionally|also|moreover|furthermore|first|firstly|second|secondly|third|thirdly|finally|lastly|next|then|therefore|thus|as a result|consequently|meanwhile|for example|for instance|in contrast|on the other hand|similarly|in short|in summary|overall)\b/i;

/**
 * Decide how to break a long paragraph into shorter ones.
 *
 * @param {string[]} sentences the paragraph's sentences
 * @param {{ limit?: number, target?: number }} [options] paragraphs at or under `limit`
 *   words are left alone; `target` is the size to aim for
 * @returns {number[]} how many sentences go in each new paragraph, e.g. [3, 2, 4]
 */
export function chunkSizes(sentences, { limit = LIMITS.paragraph, target = 80 } = {}) {
  const lengths = sentences.map(countWords);
  const total = lengths.reduce((a, b) => a + b, 0);
  const n = sentences.length;
  if (total <= limit || n < 2) return [n];

  const k = Math.min(n, Math.max(2, Math.round(total / target)));
  const goal = total / k;
  const bonus = (goal * 0.3) ** 2;
  const prefix = [0];
  for (const len of lengths) prefix.push(prefix[prefix.length - 1] + len);
  const cost = (from, to) => (prefix[to] - prefix[from] - goal) ** 2 - (from > 0 && TURN.test(sentences[from]) ? bonus : 0);

  // best[j][i]: the lowest cost of putting the first i sentences into j paragraphs.
  const best = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const back = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let from = j - 1; from < i; from++) {
        const c = best[j - 1][from] + cost(from, i);
        if (c < best[j][i]) {
          best[j][i] = c;
          back[j][i] = from;
        }
      }
    }
  }
  const sizes = [];
  for (let j = k, i = n; j > 0; j--) {
    sizes.unshift(i - back[j][i]);
    i = back[j][i];
  }
  return sizes;
}

/* ------------------------------------------------------------------------------------ */

/**
 * Apply the chosen fixes to a segmented document. The input is not changed.
 *
 * @param {ReturnType<import('./measure.js').segmentDocument>} doc
 * @param {{ split?: boolean, chunk?: boolean, keep?: Set<string> }} [options]
 *   `keep` holds the ids of sentences the reader has asked to see as written
 * @returns a document of the same shape. A sentence made by splitting carries
 *   `split: { id, part, of, original }`. A paragraph made by chunking carries
 *   `chunk: { id, part, of }`.
 */
export function applyFixes(doc, { split = false, chunk = false, keep = new Set() } = {}) {
  const blocks = [];
  for (const block of doc.blocks) {
    if (!['paragraph', 'list', 'quote'].includes(block.type)) {
      blocks.push(block);
      continue;
    }
    let sentences = block.sentences;
    if (split) {
      sentences = sentences.flatMap((sentence) => {
        if (keep.has(sentence.id)) return [{ ...sentence, kept: true }];
        const parts = splitSentence(sentence.text);
        if (parts.length === 1) return [sentence];
        return parts.map((text, i) => ({
          id: `${sentence.id}/${i}`,
          text,
          split: { id: sentence.id, part: i + 1, of: parts.length, original: sentence.text },
        }));
      });
    }
    const sizes = chunk && block.type !== 'list' ? chunkSizes(sentences.map((s) => s.text)) : [sentences.length];
    if (sizes.length === 1) {
      blocks.push({ ...block, sentences });
      continue;
    }
    let from = 0;
    sizes.forEach((size, i) => {
      blocks.push({ ...block, sentences: sentences.slice(from, from + size), chunk: { id: block.id, part: i + 1, of: sizes.length } });
      from += size;
    });
  }
  return { ...doc, blocks };
}
