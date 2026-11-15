import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitSentences, tokenize, usesLowercaseSentences } from '../src/core/segment.js';

test('tokens: words keep their apostrophes and hyphens', () => {
  const kinds = (text) => tokenize(text).map((t) => `${t.kind}:${t.text}`);
  assert.deepEqual(kinds("Don't use state-of-the-art jargon."), ["word:Don't", 'word:use', 'word:state-of-the-art', 'word:jargon']);
  assert.deepEqual(kinds('In the U.S. it cost $3.50, or 1,000 yen.'), [
    'word:In', 'word:the', 'abbr:U.S.', 'word:it', 'word:cost', 'number:3.50', 'word:or', 'number:1,000', 'word:yen',
  ]);
  assert.deepEqual(kinds('The 1990s, the 2nd time'), ['word:The', 'number:1990s', 'word:the', 'number:2nd', 'word:time']);
});

test('tokens: a link at the end of a sentence does not swallow the full stop', () => {
  const tokens = tokenize('See https://example.com/a?b=1. Then write to help@example.com.');
  assert.deepEqual(tokens.filter((t) => t.kind === 'link').map((t) => t.text), ['https://example.com/a?b=1', 'help@example.com']);
});

/** Each case: the text, then the sentences it should split into. */
const CASES = [
  ['Dr. Rao paid $3.50 at 5 p.m. in the U.S. and left. Then she slept.', ['Dr. Rao paid $3.50 at 5 p.m. in the U.S. and left.', 'Then she slept.']],
  ['He works at Acme Inc. The company is big.', ['He works at Acme Inc.', 'The company is big.']],
  ['Acme Inc. shares fell. Nobody was surprised.', ['Acme Inc. shares fell.', 'Nobody was surprised.']],
  ['See Fig. 3 and p. 12 for details. It is clear.', ['See Fig. 3 and p. 12 for details.', 'It is clear.']],
  ['The answer was no. He left.', ['The answer was no.', 'He left.']],
  ['"Why?" she asked. "Because," he said.', ['"Why?" she asked.', '"Because," he said.']],
  ['Wait... what? No!', ['Wait... what?', 'No!']],
  ['J. K. Rowling wrote it. George W. Bush read it.', ['J. K. Rowling wrote it.', 'George W. Bush read it.']],
  ['We chose Plan B. Then we left.', ['We chose Plan B.', 'Then we left.']],
  ['The meeting is at 5 p.m. Tuesday. Bring notes.', ['The meeting is at 5 p.m. Tuesday.', 'Bring notes.']],
  ['The shop opens at 9 a.m. The queue starts earlier.', ['The shop opens at 9 a.m.', 'The queue starts earlier.']],
  ['Use e.g. a pen, i.e. something that writes. OK?', ['Use e.g. a pen, i.e. something that writes.', 'OK?']],
  ['1. Sign the form. 2. Post it.', ['1. Sign the form.', '2. Post it.']],
  ['Mr. and Mrs. Smith met St. John on Main St. They talked.', ['Mr. and Mrs. Smith met St. John on Main St.', 'They talked.']],
  ['Visit example.com. Then call us.', ['Visit example.com.', 'Then call us.']],
  ['He earned a Ph.D. in 2010. Then he taught.', ['He earned a Ph.D. in 2010.', 'Then he taught.']],
  ['This is version 2.0. It is new.', ['This is version 2.0.', 'It is new.']],
  ['The U.N. said so. The E.U. agreed.', ['The U.N. said so.', 'The E.U. agreed.']],
  ['What a day! what a mess', ['What a day! what a mess']],
  ['Read the terms (see sec. 4). Then sign.', ['Read the terms (see sec. 4).', 'Then sign.']],
  ['It ended.[1] A new era began.', ['It ended.[1]', 'A new era began.']],
  ['Write to help@example.com. We reply fast.', ['Write to help@example.com.', 'We reply fast.']],
  ['He said "Stop." Then he ran.', ['He said "Stop."', 'Then he ran.']],
  ['Smith et al. found it. Others agreed.', ['Smith et al. found it.', 'Others agreed.']],
  ['It rained on Jan. 5 and Feb. 9. We stayed in.', ['It rained on Jan. 5 and Feb. 9.', 'We stayed in.']],
  ['Bring pens, paper, etc. The rest is provided.', ['Bring pens, paper, etc.', 'The rest is provided.']],
  ['It cost approx. five dollars. Cheap!', ['It cost approx. five dollars.', 'Cheap!']],
  ['One sentence with no full stop', ['One sentence with no full stop']],
];

for (const [text, expected] of CASES) {
  test(`sentences: ${text}`, () => {
    assert.deepEqual(splitSentences(text), expected);
  });
}

test('sentences: every word survives, in order', () => {
  for (const [text] of CASES) {
    assert.equal(splitSentences(text).join(' '), text);
  }
});

test('sentences: writing without capitals is detected and split', () => {
  const text = "got home late. didn't eat much. went to bed early. slept badly.";
  assert.equal(usesLowercaseSentences([text]), true);
  assert.equal(splitSentences(text, { lowercase: true }).length, 4);
  // Ordinary prose with a few abbreviations must not trip the detector.
  assert.equal(usesLowercaseSentences(['It cost approx. five dollars. He paid. She left. They stayed.']), false);
});
