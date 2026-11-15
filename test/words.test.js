import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMMON_WORDS, COMMON_WORDS_INFO } from '../src/core/data/common-words.js';
import { baseForms, decodeWordList, encodeWordList, isCommon, storedWordCount } from '../src/core/words.js';

const lines = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const published = lines('../data/common-words.txt');
const screenWords = lines('../data/screen-words.txt');

test('word list: 5,000 words are published and every one is recognised', () => {
  assert.equal(published.length, 5000);
  assert.equal(new Set(published).size, 5000, 'no duplicates');
  assert.deepEqual(published.filter((word) => !isCommon(word)), []);
  assert.deepEqual(screenWords.filter((word) => !isCommon(word)), []);
});

test('word list: the bundled copy is smaller than the published one, and says so truthfully', () => {
  assert.equal(COMMON_WORDS_INFO.listed, 5000);
  assert.equal(COMMON_WORDS_INFO.stored, storedWordCount());
  assert.ok(storedWordCount() < 4200, `stored ${storedWordCount()}`);
  assert.ok(COMMON_WORDS.length < 16000, `${COMMON_WORDS.length} characters`);
});

test('word list: front-coding round-trips', () => {
  const words = ['a', 'able', 'about', 'above', 'be', 'bed', 'zoo'];
  assert.equal(encodeWordList(words), '0a1ble2out3ve0be2d0zoo');
  assert.deepEqual([...decodeWordList(encodeWordList(words))], words);
  const all = decodeWordList(COMMON_WORDS);
  assert.equal(encodeWordList(all), COMMON_WORDS);
});

test('everyday words: ordinary grammar is understood', () => {
  for (const word of ['walk', 'walks', 'walked', 'walking', 'walker', 'cities', 'tried', 'making', 'running', 'stopped',
    'bigger', 'happiest', 'quickly', 'simply', 'happily', "didn't", "can't", "they've", "Maria's", 'The', 'WALKED',
    'emails', 'downloading', 'websites']) {
    assert.equal(isCommon(word), true, word);
  }
});

test('everyday words: legal and bureaucratic words are not on the list', () => {
  for (const word of ['indemnify', 'notwithstanding', 'hereinafter', 'pursuant', 'thereof', 'annexure', 'remitted',
    'jurisdiction', 'arbitration', 'promulgate']) {
    assert.equal(isCommon(word), false, word);
  }
});

test('everyday words: base forms are one step only', () => {
  assert.ok(baseForms('stopped').includes('stop'));
  assert.ok(baseForms('making').includes('make'));
  assert.ok(baseForms('cities').includes('city'));
  assert.ok(baseForms('knives').includes('knife'));
  assert.ok(!baseForms('walkers').includes('walk'));
});
