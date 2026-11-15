import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyse, LIMITS } from '../src/core/index.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const { original, diagnosis } = analyse(readme, { format: 'markdown' });
const t = original.totals;

/**
 * The tool judges its own author. If the README stops being easy to read, the build
 * fails, and the claim the README makes about itself stays true.
 */
test('README: reads at Grade 8 or below', () => {
  assert.ok(t.words > 800, 'the README is long enough to measure');
  assert.ok(t.grade <= 8, `Flesch-Kincaid grade is ${t.grade.toFixed(1)}`);
});

test('README: has no sentence over 25 words', () => {
  const long = original.blocks
    .flatMap((block) => (block.measured ? block.sentences : []))
    .filter((sentence) => sentence.words > LIMITS.sentence)
    .map((sentence) => `${sentence.words} words: ${sentence.text.slice(0, 80)}`);
  assert.deepEqual(long, []);
});

test('README: says the grade Legible actually gives it', () => {
  const claimed = /It reads at Grade (\d+)/.exec(readme);
  assert.ok(claimed, 'the README states its own grade');
  assert.equal(Number(claimed[1]), diagnosis.verdict.gradeNumber);
});

test('README: no problem worse than minor', () => {
  assert.deepEqual(diagnosis.issues.filter((issue) => issue.level !== 'minor').map((issue) => issue.id), []);
});

test('README: the figures it quotes match the code', async () => {
  const { COMMON_WORDS_INFO } = await import('../src/core/data/common-words.js');
  assert.ok(readme.includes(`stored as ${COMMON_WORDS_INFO.stored.toLocaleString('en')} entries`), 'stored word count');
  const exceptions = (await import('../src/core/data/syllable-exceptions.js')).SYLLABLE_EXCEPTIONS;
  const count = exceptions.split('|').reduce((n, group) => n + group.slice(group.indexOf(':') + 1).split(' ').length, 0);
  assert.ok(readme.includes(`A table of ${count} exceptions`), `exception count is ${count}`);
  assert.ok(readme.includes('https://legible-ashy.vercel.app'), 'live address');
});
