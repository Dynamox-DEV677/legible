import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { countSyllables, heuristicSyllables, numberSyllables } from '../src/core/syllables.js';
import { agrees } from '../tools/lib/datasets.mjs';

const CASES = {
  // silent vowels
  the: 1, make: 1, table: 2, whole: 1, walked: 1, wanted: 2, makes: 1, boxes: 2, settled: 2, called: 1,
  homework: 2, safety: 2, likely: 2, statement: 2, something: 2, therefore: 2, everyone: 3, business: 2,
  // vowel pairs that are two syllables
  react: 2, create: 2, creature: 2, idea: 3, area: 3, radio: 3, video: 3, quiet: 2, society: 4, science: 2,
  patient: 2, special: 2, nation: 2, million: 2, lion: 2, serious: 3, precious: 2, usual: 3, medium: 3,
  poem: 2, going: 2, being: 2, trying: 2, cooperate: 4, theatre: 3, museum: 3, fuel: 2, ruin: 2,
  // consonant u and y
  queue: 1, question: 2, language: 2, guard: 1, argue: 2, player: 2, beyond: 2, canyon: 2, yes: 1,
  // endings
  rhythm: 2, basically: 3, capitalism: 5, simultaneously: 6, accessibility: 6, readable: 3,
  // contractions, compounds, capitals and accents
  "didn't": 2, "don't": 1, "it'll": 2, "we'll": 1, "boss's": 2, 'state-of-the-art': 4, 'U.S.': 2, 'café': 2, Naïve: 2,
  // legal vocabulary, which is what Legible is pointed at most
  indemnify: 4, notwithstanding: 4, hereinafter: 4, jurisdiction: 4, liability: 5, pursuant: 3, aforementioned: 4,
};

test('syllables: known words', () => {
  const wrong = Object.entries(CASES)
    .filter(([word, want]) => countSyllables(word) !== want)
    .map(([word, want]) => `${word}: got ${countSyllables(word)}, want ${want}`);
  assert.deepEqual(wrong, []);
});

test('syllables: numbers are counted as they are read aloud', () => {
  assert.equal(numberSyllables('7'), 2); // seven
  assert.equal(numberSyllables('25'), 3); // twenty-five
  assert.equal(numberSyllables('1984'), 5); // nineteen eighty-four
  assert.equal(numberSyllables('2005'), 4); // two thousand five
  assert.equal(numberSyllables('1,000'), 3); // one thousand
  assert.equal(numberSyllables('3.5'), 3); // three point five
  assert.equal(countSyllables('2nd'), 1); // the ordinal ending adds nothing we can count
});

test('syllables: initialisms are spelled out when asked', () => {
  assert.equal(countSyllables('FBI', { acronym: true }), 3);
  assert.equal(countSyllables('WWW', { acronym: true }), 9);
  assert.equal(countSyllables('tv'), 2);
  assert.equal(countSyllables('hmm'), 1);
});

test('syllables: never zero for a real word, never negative', () => {
  for (const word of ['a', 'I', 'the', 'shh', 'rhythms', 'eye', 'queue', 'aa', 'yyy']) {
    assert.ok(countSyllables(word) >= 1, word);
  }
  assert.equal(countSyllables(''), 0);
  assert.equal(countSyllables('—'), 0);
});

/**
 * The accuracy claim in the README, checked on every run. The reference is the CMU
 * Pronouncing Dictionary's count for each of Legible's 5,000 everyday words.
 */
const reference = readFileSync(new URL('./fixtures/cmu-syllables.txt', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [word, counts] = line.split(' ');
    return { word, truth: new Set(counts.split('/').map(Number)) };
  });

test('syllables: the spelling rules alone agree with CMUdict on at least 98% of everyday words', () => {
  const right = reference.filter(({ word, truth }) => agrees(word, heuristicSyllables(word), truth)).length;
  const share = right / reference.length;
  assert.ok(reference.length > 4500, `reference list is too small: ${reference.length}`);
  assert.ok(share >= 0.98, `rules agree on ${(share * 100).toFixed(2)}% (${right}/${reference.length})`);
});

test('syllables: with the exception table, at least 99.5%', () => {
  const wrong = reference.filter(({ word, truth }) => !agrees(word, countSyllables(word), truth)).map((entry) => entry.word);
  const share = 1 - wrong.length / reference.length;
  assert.ok(share >= 0.995, `agreement ${(share * 100).toFixed(2)}%; misses: ${wrong.slice(0, 30).join(', ')}`);
});
