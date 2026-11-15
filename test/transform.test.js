import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLES } from '../src/app/samples.js';
import { analyse, applyFixes, chunkSizes, countWords, measure, parseText, segmentDocument, splitSentence, tokenize } from '../src/core/index.js';

/** The words of a text, lower-cased, in order. Punctuation and capitals are ignored. */
const wordsOf = (text) =>
  tokenize(text)
    .filter((t) => t.kind !== 'link' && t.kind !== 'code')
    .map((t) => t.text.toLowerCase().replace(/\.$/, ''));

test('split: a short sentence is left alone', () => {
  const text = 'The cat sat on the mat, and the dog watched it.';
  assert.deepEqual(splitSentence(text), [text]);
});

test('split: at a semicolon', () => {
  const text =
    'The office will be closed on every public holiday that falls within the current financial year; staff who are ' +
    'required to attend on those days will be told in writing at least one week ahead.';
  assert.deepEqual(splitSentence(text), [
    'The office will be closed on every public holiday that falls within the current financial year.',
    'Staff who are required to attend on those days will be told in writing at least one week ahead.',
  ]);
});

test('split: at ", and" when a clause with its own subject follows', () => {
  const text =
    'You must send the completed form to the address printed at the top of this letter before the end of the month, ' +
    'and we will write to you again as soon as a decision has been made about your claim.';
  const parts = splitSentence(text);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /end of the month\.$/);
  assert.match(parts[1], /^And we will write/);
});

test('split: a list is not mistaken for two clauses', () => {
  const text =
    'The company is not liable for damages arising out of or in connection with the use of, or the inability to use, ' +
    'the service, whether in contract, tort or otherwise, including loss of profits, goodwill, data or other losses.';
  assert.deepEqual(splitSentence(text), [text]);
});

test('split: an aside between two dashes stays where it is', () => {
  const text =
    'The new timetable for the northern line — which the council approved only after a long and difficult debate ' +
    'in March — will come into force on the first Monday of next month for every route.';
  assert.deepEqual(splitSentence(text), [text]);
});

test('split: text inside brackets or quotation marks is never cut', () => {
  const text =
    'The minister said "we have listened to every objection that was raised in the consultation; we will not ' +
    'change course" and then left the room without taking any further questions from the press.';
  assert.deepEqual(splitSentence(text), [text]);
});

test('split: THE PROMISE. Same words, same order, on every sample', () => {
  for (const sample of SAMPLES) {
    const base = segmentDocument(parseText(sample.text));
    const fixed = applyFixes(base, { split: true, chunk: true });
    const before = base.blocks.flatMap((b) => b.sentences).flatMap((s) => wordsOf(s.text));
    const after = fixed.blocks.flatMap((b) => b.sentences).flatMap((s) => wordsOf(s.text));
    assert.deepEqual(after, before, sample.id);
  }
});

test('split: every piece records the sentence it came from', () => {
  const { view } = analyse(SAMPLES[0].text, { fixes: { split: true } });
  const pieces = view.blocks.flatMap((b) => b.sentences).filter((s) => s.split);
  assert.ok(pieces.length >= 4);
  for (const piece of pieces) {
    assert.ok(piece.split.original.length > piece.text.length);
    assert.ok(piece.split.part >= 1 && piece.split.part <= piece.split.of);
  }
});

test('split: a sentence the reader asked to keep is not split', () => {
  const base = segmentDocument(parseText(SAMPLES[0].text));
  const first = base.blocks.find((b) => b.type === 'paragraph').sentences[0];
  const fixed = applyFixes(base, { split: true, keep: new Set([first.id]) });
  const same = fixed.blocks.flatMap((b) => b.sentences).find((s) => s.id === first.id);
  assert.equal(same.text, first.text);
  assert.equal(same.kept, true);
});

test('split: it lowers the grade and never raises the longest sentence', () => {
  for (const sample of SAMPLES) {
    const { original, view } = analyse(sample.text, { fixes: { split: true, chunk: true } });
    assert.ok(view.totals.grade <= original.totals.grade + 1e-9, sample.id);
    assert.ok(view.totals.longest <= original.totals.longest, sample.id);
    assert.equal(view.totals.words, original.totals.words, sample.id);
  }
});

test('chunk: a long paragraph is broken into balanced pieces at sentence ends', () => {
  const sentence = 'This sentence has exactly ten words in it, you see.';
  assert.equal(countWords(sentence), 10);
  assert.deepEqual(chunkSizes(new Array(10).fill(sentence)), [10], '100 words is under the limit');
  const sizes = chunkSizes(new Array(24).fill(sentence));
  assert.equal(sizes.reduce((a, b) => a + b, 0), 24);
  assert.deepEqual(sizes, [8, 8, 8]);
});

test('chunk: prefers to break before a sentence that turns the argument', () => {
  const plain = 'This sentence has exactly ten words in it, you see.';
  const turn = 'However, this sentence also has ten words in it here.';
  const sentences = [...new Array(9).fill(plain), turn, ...new Array(6).fill(plain)];
  const sizes = chunkSizes(sentences);
  assert.equal(sizes[0], 9, `break lands before "However": ${sizes}`);
});

test('chunk: the circular sample ends up with no paragraph over the limit', () => {
  const circular = SAMPLES.find((s) => s.id === 'circular');
  const { original, view } = analyse(circular.text, { fixes: { split: true, chunk: true } });
  assert.equal(original.totals.longParagraphs, 1);
  assert.equal(view.totals.longParagraphs, 0);
  const pieces = view.blocks.filter((b) => b.chunk);
  assert.ok(pieces.length >= 2);
  assert.equal(measure(segmentDocument(parseText(circular.text))).totals.words, view.totals.words);
});
