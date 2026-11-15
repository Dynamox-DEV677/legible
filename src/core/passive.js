/**
 * Passive voice, estimated.
 *
 * This is a pattern match, not a parser: a form of "be", then (within a few words) a
 * past participle. "The form was signed" matches. So does "the shop is closed", which
 * describes a state. "Was the form signed?" is missed because the subject sits in
 * between. Legible always labels this number an estimate for that reason.
 */

const set = (words) => new Set(words.split(' '));

const BE = set("am is are was were be been being isn't aren't wasn't weren't");

/** Words that may sit between "be" and the participle: "was never told", "is being built". */
const BRIDGE = set('not never also just still already often always now then only ever even being been so thus yet');

const IRREGULAR = set(
  'done made given taken seen known shown written held kept left found told sold sent built paid put set cut read ' +
    'brought bought caught taught thought sought fought lost met led fed heard said laid worn torn sworn drawn grown ' +
    'thrown blown flown driven ridden bitten hidden forbidden forgotten gotten chosen frozen spoken stolen broken ' +
    'woken shaken mistaken eaten beaten forgiven undone begun drunk sung sunk rung stung hung struck stuck dug spun ' +
    'won shot hit hurt shut split spread cast burst bound ground wound felt dealt meant lent spent bent burnt learnt ' +
    'swept understood withdrawn overcome undertaken overseen upheld withheld rewritten misunderstood outdone ' +
    'broadcast forecast reset upset let beset run borne sewn sown proven slain stricken strewn swollen woven arisen ' +
    'foreseen forgone overtaken underwritten overthrown overridden',
);

/** End in -ed but are not participles. */
const NOT_PARTICIPLES = set('indeed need feed seed speed bleed breed greed weed deed reed creed exceed proceed succeed hundred sacred naked wicked embed infrared kindred hatred');

/** Participles that nearly always describe a feeling or state rather than an action done to someone. */
const STATES = set(
  'tired excited interested worried pleased married concerned scared surprised bored confused satisfied delighted ' +
    'embarrassed exhausted ashamed relaxed depressed frightened terrified annoyed amazed shocked thrilled ' +
    'disappointed frustrated experienced advanced complicated sophisticated talented gifted supposed born gone',
);

function isParticiple(word) {
  if (STATES.has(word) || NOT_PARTICIPLES.has(word)) return false;
  if (IRREGULAR.has(word)) return true;
  return word.length >= 4 && word.endsWith('ed') && !word.endsWith('eed');
}

/**
 * @param {string} text one sentence
 * @param {import('./segment.js').Token[]} tokens its tokens
 * @returns {{ start: number, end: number }[]} the span of each passive construction
 */
export function findPassive(text, tokens) {
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'word' || !BE.has(tokens[i].text.toLowerCase().replace(/’/g, "'"))) continue;
    for (let k = 1; k <= 3 && i + k < tokens.length; k++) {
      const candidate = tokens[i + k];
      // Only spaces may separate the words: a comma or a bracket breaks the construction.
      if (candidate.kind !== 'word' || !/^\s+$/.test(text.slice(tokens[i + k - 1].end, candidate.start))) break;
      const word = candidate.text.toLowerCase();
      if (isParticiple(word)) {
        found.push({ start: tokens[i].start, end: candidate.end });
        i += k;
        break;
      }
      if (!BRIDGE.has(word) && !word.endsWith('ly')) break;
    }
  }
  return found;
}
