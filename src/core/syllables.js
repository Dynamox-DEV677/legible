/**
 * Syllable counting for English.
 *
 * English spelling does not map cleanly onto syllables, so this works in three layers:
 *
 *   1. Count vowel groups: "beau-ti-ful" has three.
 *   2. Correct the places where spelling misleads. Some vowels are silent ("make",
 *      "walked", "homework"). Some vowel pairs are really two syllables ("re-act",
 *      "ra-di-o", "qui-et").
 *   3. Look up a table of common words that the rules still get wrong.
 *
 * The rules were tuned against the CMU Pronouncing Dictionary, and `npm test` measures
 * the agreement rate so that it cannot quietly get worse. Nothing here is copied from
 * that dictionary except the exception table, which tools/build-data.mjs derives.
 */

import { SYLLABLE_EXCEPTIONS } from './data/syllable-exceptions.js';
import { isCommon } from './words.js';

const isVowel = (c) => c !== undefined && c !== '' && 'aeiouy'.includes(c);
const hasVowel = (s) => /[aeiouy]/.test(s);
const last = (s) => s[s.length - 1] || '';
/** One to three consonants and nothing else: the "br" of "Bryan". */
const initialCluster = (b) => b.length >= 1 && b.length <= 3 && !hasVowel(b);

/* ------------------------------------------------------------------------------------
 * Exceptions
 * ---------------------------------------------------------------------------------- */

/** Words the rules below are known to break. Format: "count:word word|count:word". */
const MANUAL_EXCEPTIONS =
  // Abbreviations are counted the way they are said: "St." is "street", "Dr." is "doctor".
  '1:st ms mt ft lb lbs oz aisle isle pier tier suave suede aches juan|' +
  '2:mr mrs dr vs jr sr ok tv maybe cafe forte acne psyche naked wicked wretched crooked ' +
  'rugged ragged jagged dogged soldier cashier frontier glacier premier persuade business ' +
  'evening wednesday naive phoebe chloe zoe guinea righteous colonel diamond diaper herpes ' +
  'headaches heartaches backaches bloodshed deathbed seabed hotbed unwed solely|' +
  '3:ltd albeit pancreas recipe sesame karate simile adobe finale element tenement vehement ' +
  'increment excrement decrement infrared businesses persuaded persuasion persuasive ' +
  'vegetable chandelier cavalier brigadier bombardier chevalier financier garcia machete ' +
  'tamale geniuses riverbed newlywed watershed|' +
  '4:apostrophe catastrophe epitome hyperbole karaoke vigilante anemone ukulele nevertheless ' +
  'diabetes etc';

function readTable(table, into = new Map()) {
  for (const group of table.split('|')) {
    const colon = group.indexOf(':');
    if (colon < 1) continue;
    const count = Number(group.slice(0, colon));
    for (const word of group.slice(colon + 1).split(' ')) if (word) into.set(word, count);
  }
  return into;
}

// The generated table is read first so that a deliberate choice above always wins.
const EXCEPTIONS = readTable(MANUAL_EXCEPTIONS, readTable(SYLLABLE_EXCEPTIONS));

/** For the build script: the hand-written table on its own. */
export const manualExceptions = () => readTable(MANUAL_EXCEPTIONS);

/**
 * Look a word up in an exception table. A plain plural borrows its singular's count
 * ("chocolates" from "chocolate"), since adding s does not add a syllable there.
 * @returns {number | undefined}
 */
export function lookupException(table, w) {
  const known = table.get(w);
  if (known !== undefined) return known;
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is|[sxz]es|[cs]hes)$/.test(w)) return table.get(w.slice(0, -1));
  return undefined;
}

/* ------------------------------------------------------------------------------------
 * Silent vowels
 * ---------------------------------------------------------------------------------- */

/**
 * What can follow a silent "e" inside a compound or derived word: home|work, safe|ty,
 * like|ly, state|ment. "j" and "w" stand for the consonant readings of y and u that
 * heuristicSyllables() marks before it gets here.
 */
const AFTER_SILENT_E = new RegExp(
  '^(?:ly|less(?:ly|ness)?|ness|ful(?:ly|ness)?|ments?|some|things?|times?|where|works?|' +
    'lands?|ways?|s?m[ae]n|hold(?:s|ers?)?|balls?|boards?|rooms?|sides?|lines?|like|wise|by|' +
    'fore|ty|ties|teen|back|jards?|light|ships?|gwards?|town|mates?|wood|ware|houses?|' +
    'stones?|hood|li(?:hood|ness)|(?:keep|mak|work)ers?|paper|place|books?|days?|field|' +
    'marks?|walk|wall|well|worthy|dom|coming|craft|front|hand|long|play|power|stock|styles?|' +
    'words?|cakes?|head|sick|pages?|body|how|what|lets?|wife|wives|shoes?|made)$',
);

/**
 * A consonant followed by l or r carries its own syllable: "ta-ble", "a-cre", "set-tled".
 * Not after l, r or w, where the pair belongs to the syllable before: "called", "curled",
 * "crawled", "stirred".
 */
const syllabicLiquid = (liquid, before) =>
  before !== undefined &&
  !isVowel(before) &&
  ((liquid === 'l' && !'lrw'.includes(before)) || (liquid === 'r' && !'rw'.includes(before)));

/**
 * A join between two everyday words: wave|length, ice|box, safe|keeping. The first word
 * must end in the e, and the second must start with a consonant other than r, because
 * "e" before "r" is nearly always sounded (gen-er-ate, not gene|rate).
 */
function joinsTwoWords(w, i) {
  const head = w.slice(0, i + 1);
  const tail = w.slice(i + 1);
  if (tail.length < 3 || isVowel(tail[0]) || tail[0] === 'r' || !hasVowel(tail)) return false;
  return (isCommon(head) || head.endsWith('fore')) && isCommon(tail);
}

/**
 * @param {string} s the word with consonant y and u already marked
 * @param {string} w the word as spelled, which lines up letter for letter with s
 */
function silentInside(s, w) {
  for (let i = 2; i < s.length - 2; i++) {
    if (s[i] !== 'e' || isVowel(s[i - 1])) continue;
    const eyeCompound = i === 2 && s.startsWith('eje'); // eye|brow, eye|lid
    if (!eyeCompound && !AFTER_SILENT_E.test(s.slice(i + 1)) && !joinsTwoWords(w, i)) continue;
    // Needs a vowel, then one to three consonants, then this e: "hom|e", "els|e", "judg|e".
    let j = i - 1;
    while (j >= 0 && !isVowel(s[j]) && i - j <= 3) j--;
    if (j < 0 || !isVowel(s[j])) continue;
    if (syllabicLiquid(s[i - 1], s[i - 2])) continue; // set-tle-ment keeps its e
    return 1;
  }
  return 0;
}

function silentAtEnd(s) {
  const n = s.length;
  const c1 = s[n - 1];
  const c2 = s[n - 2];
  const c3 = s[n - 3];
  const c4 = s[n - 4];
  const consonant = (c) => c !== undefined && !isVowel(c);

  // Final e: silent in "make" and "whole", sounded in "ta-ble" and "a-cre".
  if (c1 === 'e' && consonant(c2)) return syllabicLiquid(c2, c3) ? 0 : 1;
  if (n <= 3 || c2 !== 'e' || !consonant(c3)) return 0;

  // -es: silent in "makes", sounded after a hiss in "boxes", "pages", "wishes".
  if (c1 === 's') {
    const hiss = 'sxzcg'.includes(c3) || (c3 === 'h' && (c4 === 'c' || c4 === 's'));
    return hiss || syllabicLiquid(c3, c4) ? 0 : 1;
  }
  // -ed: silent in "walked", sounded after t or d in "wanted", "needed".
  if (c1 === 'd') return c3 === 't' || c3 === 'd' || syllabicLiquid(c3, c4) ? 0 : 1;
  return 0;
}

/* ------------------------------------------------------------------------------------
 * Hiatus: two vowel letters side by side that are spoken as two syllables.
 * Each rule receives what comes before the pair and what comes after it.
 * ---------------------------------------------------------------------------------- */

const HIATUS = {
  ia(b, a) {
    const p = last(b);
    if (b.length <= 1) return true; // Ian, dial, giant, liar
    if (/^ges?$/.test(a) && b.endsWith('rr')) return false; // marriage, carriage
    if (p === 'c' || p === 't' || p === 's' || p === 'g') {
      if (a === 'c' || a === 'cs') return true; // Pontiac, aphrodisiac
      if (p === 'c' || p === 't') {
        if (/^t(?:e|es|ed|ing|ions?|ors?)$/.test(a)) return true; // appreciate, negotiation
        if (/^[ln]it(?:y|ies)$/.test(a)) return true; // speciality, Christianity
        if (p === 'c' && /^r(?:y|ies)$/.test(a)) return true; // beneficiary, judiciary
      }
      if (p === 's' && (a[0] === 'h' || /^s[tm]/.test(a))) return true; // Messiah, enthusiasm
      return false; // special, initial, Asia, Georgia
    }
    if (p === 'l') {
      if (a === '') return false; // Julia, Australia
      if (b[b.length - 2] === 'l') return b.endsWith('all') && a.startsWith('nc'); // alliance, but not brilliant
      if (/^nts?$/.test(a)) return /(?:rel|mpl)$/.test(b); // reliant, compliant, but not valiant
      if (/^(?:ns?|rs?|ms?)$/.test(a) || a.startsWith('ment')) return false; // Italian, familiar, parliament
    }
    return true; // media, material, piano
  },
  io(b, a) {
    const p = last(b);
    if (!p) return true; // ion, iodine
    if (p === 'g') return false; // region, religious
    if (p === 'v' && /^u?r/.test(a)) return false; // behavior, behaviour, behavioral
    if (p === 'l' && b.length > 1) {
      if (/^ns?$/.test(a)) return false; // million, battalion (but li-on)
      if (b[b.length - 2] === 'l' && (a[0] === 'u' || a[0] === 'n')) return false; // rebellious, millionaire
    }
    if (a[0] === 'u') return !'ctx'.includes(p); // serious, but not precious
    if (a[0] === 'n' && ('tscx'.includes(p) || (p === 'h' && b[b.length - 2] === 's'))) return false; // nation, vision, fashion
    if (p === 'n' && /^[nr]/.test(a)) return false; // union, senior
    return true; // radio, period, violin
  },
  iu(b, a) {
    const p = last(b);
    if (p === 'g') return false; // Belgium
    return !(a === 's' && 'lnct'.includes(p)); // radius, medium, but not genius or Julius
  },
  ii: () => true, // skiing
  ua: () => true, // usual, situation ("qu" and "gu" are marked as consonants before this runs)
  uo: (b, a) => a === '' || a === 's' || a[0] === 'u', // duo, continuous
  ue(b, a) {
    if (/^rs?$/.test(a)) return true; // truer, rescuer
    if (/^(?:n[tcz]|ts?$|tte|lty)/.test(a)) return true; // fluent, influenza, duet, cruelty
    return !hasVowel(b) && /^(?:l(?:s|ed|led|ing|ling)?|st)$/.test(a); // fuel, fuelled, truest, but not Samuel
  },
  ui: (b, a) => /^(?:n(?:s|ed|ing|e|ely)?$|ds?$|t(?:y|ies)$|tion|tive|cid|ng)/.test(a), // ruin, fluid, tuition
  ea(b, a) {
    if (b.endsWith('e')) return true; // agre-e-able
    if (b === 'r') return /^(?:ct|l[it]|pp|ss|rr|ff|dj|dm|bs|w)/.test(a); // react, reality, reappear
    if (b === 'pr') return /^(?:mb|rr|ss|pp)/.test(a); // preamble
    if (b.endsWith('cr') && a[0] === 't' && a[1] !== 'u') return true; // create, but not creature
    if (b.endsWith('th') && a[0] === 't') return true; // theatre
    if (a === '' && hasVowel(b) && !b.endsWith('s')) return true; // area, idea, Korea
    if (a === 's' && /(?:id|ar)$/.test(b)) return true; // ideas, areas, but not whereas
    if (/^ns?$/.test(a) && /(?:op|or|bb|rran|il|ul)$/.test(b)) return true; // European, Korean
    if (a === 'l' && /[aeiou]r$/.test(b)) return true; // cereal
    return a === 'r' && /(?:ucl|^lin)$/.test(b); // nuclear, linear
  },
  eo(b, a) {
    const p = last(b);
    if (p === 'a') return true; // archaeology
    if (a[0] === 'u') return a[1] === 's' && p !== 'g' && p !== 'c'; // hideous, but not gorgeous or hide|out
    if (a === '' || a === 's') return p !== 'g' || b === 'g'; // video, stereo
    if (/^ns?$/.test(a)) return p !== 'g' && !b.endsWith('ch'); // neon, but not pigeon or luncheon
    if (b === 'g') return !/^(?:rg|ff)/.test(a); // geography, but not George
    if (/^(?:th|n|r|pr|d|met|cr)$/.test(b)) return true; // theory, reopen, meteor
    return /(?:ster|vid)$/.test(b); // stereotype, videotape
  },
  eu(b, a) {
    if (b === 'r') return /^[ns]/.test(a); // reunion, reuse
    if (/^ms?$/.test(a)) return true; // museum
    return a === 's' && hasVowel(b); // nucleus
  },
  ee: (b, a) => b === 'r' && /^(?:nt|na|lec|sta|va|xa|du)/.test(a), // re-enter, re-elect
  ei(b, a) {
    if (/^ngs?$/.test(a)) return true; // being, seeing
    if (a === 'ty' || a === 'ties') return true; // deity
    if (b === 'r') return /^(?:nf|nv|nst|ntr|nc|mb|mp|te|ss)/.test(a); // reinforce, reiterate
    if (b === 'd') return /^[fs]/.test(a); // deify
    return b.endsWith('th') && a[0] === 's'; // atheist
  },
  ie(b, a) {
    const p = last(b);
    if (a[0] === 't') return true; // diet, quiet, society
    if (/^n[tc]/.test(a)) return b === 'sc' || !'ctn'.includes(p); // client, science, but not patient
    if (a.startsWith('nn')) return true; // Vienna
    if (a === 'ry') return true; // fiery
    if (b === 'h' && a[0] === 'r') return true; // hierarchy
    if (p === 'r' && /^l(?:s|le|la)?$/.test(a)) return true; // Gabriel, Ariel
    if (isVowel(p)) return false;
    if (!hasVowel(b)) return b.length >= 2 && /^rs?$/.test(a); // flier, drier, but not pier or priest
    return /^(?:rs?|sts?|ns?)$/.test(a) || a.startsWith('nat'); // easier, happiest, alien, alienate
  },
  oa(b, a) {
    return (
      /^(?:lit|sis|nn)/.test(a) || // coalition, oasis, Joanna
      a === 'h' || // Noah
      (b.endsWith('k') && a === 'la') || // koala
      (b === 'b' && (a === '' || a === 's')) || // boa
      (b === 'cr' && a[0] === 't') // Croatia
    );
  },
  oe: (b, a) => /^(?:ms?$|ts?$|tr|ti|x|rc|ff|ls?$|y|rs?$|ver)/.test(a), // poem, poetry, coexist, whoever
  oi(b, a) {
    if (/^ngs?$/.test(a)) return true; // going, doing
    if (/^(?:cs?$|cal|ncid)/.test(a)) return true; // heroic, coincide
    if (b.endsWith('er') && /^n(?:e|es|s)?$/.test(a)) return true; // heroin, heroine
    return /^s[tm]/.test(a) && hasVowel(b); // soloist, but not hoist
  },
  oo: (b, a) => (b === 'c' && /^(?:perat|rdinat)/.test(a)) || (b === 'z' && a.startsWith('log')), // cooperate, zoology
  ao: (b, a) => /^[str]/.test(a), // chaos, chaotic, aorta
  ai: (b, a) => /^(?:cs?$|cal)/.test(a), // mosaic, archaic
  yi: (b, a) => last(b) !== '' && !isVowel(last(b)) && a.startsWith('ng'), // trying, studying
  ye(b, a) {
    if (b === '' || 'aeiouw'.includes(last(b))) return false;
    if (/^rs?$/.test(a)) return true; // flyer, dryer
    return initialCluster(b) && !/^[ds]?$/.test(a); // hyena, but not dye, dyed, dyes
  },
  yo: (b, a) => a.startsWith('ne') || initialCluster(b), // anyone, Wyoming
  ya: (b) => initialCluster(b), // cyan, Ryan
  yu: (b) => initialCluster(b),
};

function hiatusCount(s) {
  let n = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const rule = HIATUS[s[i] + s[i + 1]];
    if (rule && rule(s.slice(0, i), s.slice(i + 2))) n++;
  }
  return n;
}

/* ------------------------------------------------------------------------------------
 * The heuristic
 * ---------------------------------------------------------------------------------- */

/** Letters said one at a time: "tv", "pdf". A "w" takes three syllables to say. */
function spelledOut(w) {
  let n = 0;
  for (const c of w) n += c === 'w' ? 3 : 1;
  return n;
}

/**
 * Estimate syllables from spelling alone, with no exception table.
 * @param {string} w a single lower-case word, letters a-z only
 */
export function heuristicSyllables(w) {
  if (w.length === 0) return 0;
  if (w.length === 1) return spelledOut(w);
  if (!hasVowel(w)) {
    // Sounds rather than words ("hmm", "shh", "psst") are one beat. Anything else is an
    // abbreviation that people read letter by letter.
    return /^(?:h*m+|z+|s+h+|ps+t|[bg]r+|tsk|pf+t)$/.test(w) ? 1 : spelledOut(w);
  }

  // "qu" is a consonant pair, and so is "gu" before a vowel (guard, language, league).
  // The u is rewritten as "w" so it stops counting as a vowel. "Argue" is the one common
  // family where that u is sounded, and it is put back further down.
  let s = w.replace(/qu/g, 'qw').replace(/gu(?=[aeiy])/g, 'gw');
  // y is a consonant at the start of a word (yes), between vowels (player), in "-yard",
  // and after n in words like "canyon". It is rewritten as "j".
  s = s.replace(/^y(?=[aeiou])/, 'j').replace(/([aeiou])y(?=[aeiou])/g, '$1j');
  if (!s.startsWith('any')) s = s.replace(/([aeiou]n)y(?=[ao])/g, '$1j');
  s = s.replace(/y(?=ards?$)/, 'j');

  let n = 0;
  let inGroup = false;
  for (const c of s) {
    const v = isVowel(c);
    if (v && !inGroup) n++;
    inGroup = v;
  }

  n -= silentAtEnd(s);
  n -= silentInside(s, w);
  if (s.endsWith('ically')) n--; // "bas-ic-ly", not "bas-ic-al-ly"
  if (s.startsWith('every')) n--; // "ev-ry"

  n += hiatusCount(s);
  if (/(?:[aeiouy]sm|thm)s?$/.test(s)) n++; // "pris-m", "rhyth-m"
  if (s.startsWith('mc')) n++; // "Mc-Don-ald"
  if (/^argw/.test(s)) n++; // "ar-gu-ing"

  return Math.max(1, n);
}

/* ------------------------------------------------------------------------------------
 * Numbers, as they are read aloud
 * ---------------------------------------------------------------------------------- */

const ONES = [2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 3, 1, 2, 2, 2, 2, 3, 2, 2]; // zero … nineteen
const TENS = [0, 0, 2, 2, 2, 2, 2, 3, 2, 2]; // twenty … ninety
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : 0));
const below1000 = (n) => (n >= 100 ? ONES[Math.floor(n / 100)] + 2 : 0) + (n % 100 ? below100(n % 100) : 0);
const digitByDigit = (digits) => [...digits].reduce((n, d) => n + ONES[Number(d)], 0);

function cardinal(digits) {
  if (digits.length > 15 || (digits.length > 1 && digits[0] === '0')) return digitByDigit(digits);
  let n = Number(digits);
  if (n === 0) return ONES[0];
  let total = 0;
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) total += below1000(chunk) + (scale ? 2 : 0); // thousand, million, billion: two each
  }
  return total;
}

/**
 * Syllables in a number as spoken. Four-digit numbers from 1100 to 2099 are read the way
 * years are ("nineteen eighty-four"), which is also how most people say "1500".
 * @param {string} token digits with optional commas and one decimal point
 */
export function numberSyllables(token) {
  const [whole, fraction] = token.replace(/,/g, '').split('.');
  let n;
  const value = Number(whole);
  if (whole.length === 4 && fraction === undefined && value >= 1100 && value <= 2099 && (value < 2000 || value > 2009)) {
    const hi = Math.floor(value / 100);
    const lo = value % 100;
    n = below100(hi) + (lo === 0 ? 2 : lo < 10 ? 1 + ONES[lo] : below100(lo)); // "hundred" / "oh five"
  } else {
    n = whole ? cardinal(whole) : 0;
  }
  if (fraction) n += 1 + digitByDigit(fraction); // "point" and each digit
  return n;
}

/* ------------------------------------------------------------------------------------
 * Public API
 * ---------------------------------------------------------------------------------- */

const bare = (w) => lookupException(EXCEPTIONS, w) ?? heuristicSyllables(w);

/** A lower-case word that may carry an apostrophe: "didn't", "it'll", "boss's". */
function wordSyllables(raw) {
  const w = raw.replace(/^'+|'+$/g, '');
  if (!w) return 0;
  const m = /^([a-z]+)(n't|'ve|'ll|'re|'d|'m|'s)$/.exec(w);
  if (!m) return bare(w.replace(/'/g, ''));
  const [, base, tail] = m;
  if (tail === "n't") {
    // "don't" and "can't" are one beat; "did-n't" and "is-n't" are two.
    return /^(?:ca|wo|sha|ai|do|are|were)$/.test(base) ? 1 : bare(base) + 1;
  }
  const n = bare(base);
  if (tail === "'m") return n;
  if (tail === "'s") return n + (/(?:[sxz]|[cs]h|[csgz]e)$/.test(base) ? 1 : 0); // "boss's", "George's"
  if (tail === "'d") return n + (/[td]$/.test(base) ? 1 : 0); // "it'd"
  return n + (/[^aeiouyw]$/.test(base) ? 1 : 0); // "it'll", "could've", but not "we'll"
}

/**
 * Count the syllables in one token of running text.
 *
 * @param {string} token a word as written: may hold capitals, accents, apostrophes,
 *   hyphens, digits or full stops ("state-of-the-art", "U.S.", "3.5", "didn't")
 * @param {{ acronym?: boolean }} [options] set `acronym` when the token is an initialism
 *   that is read letter by letter ("FBI")
 * @returns {number} zero only when the token has no letters or digits
 */
export function countSyllables(token, { acronym = false } = {}) {
  const text = String(token)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase();
  let total = 0;
  let afterNumber = false;
  for (const piece of text.match(/\d[\d.,]*\d|\d|[a-z']+/g) || []) {
    if (/^\d/.test(piece)) {
      total += numberSyllables(piece);
      afterNumber = true;
      continue;
    }
    const ordinal = afterNumber && /^(?:st|nd|rd|th|s)$/.test(piece); // 1st, 2nd, 1990s
    afterNumber = false;
    if (ordinal) continue;
    total += acronym ? spelledOut(piece.replace(/'/g, '')) : wordSyllables(piece);
  }
  return total;
}
