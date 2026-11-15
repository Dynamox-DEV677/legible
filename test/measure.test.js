import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLES } from '../src/app/samples.js';
import { analyse, lengthBands, parseText } from '../src/core/index.js';

const sample = (id) => SAMPLES.find((s) => s.id === id).text;
const near = (actual, expected, tolerance = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('scores: Flesch and Flesch-Kincaid match a hand calculation', () => {
  // 2 sentences, 9 words, 11 syllables (the, cat, sat, on, the, mat, it, was = 1 each; happy = 2... counted below).
  const { original } = analyse('The cat sat on the mat. It was happy.');
  const t = original.totals;
  assert.equal(t.sentences, 2);
  assert.equal(t.words, 9);
  assert.equal(t.syllables, 10); // nine words, one of them ("happy") with two syllables
  near(t.wordsPerSentence, 4.5);
  near(t.syllablesPerWord, 10 / 9);
  near(t.ease, 206.835 - 1.015 * 4.5 - 84.6 * (10 / 9));
  near(t.grade, 0.39 * 4.5 + 11.8 * (10 / 9) - 15.59);
});

test('scores: the grade splits exactly into its sentence half and its word half', () => {
  const t = analyse(sample('terms')).original.totals;
  // Grade at the plain baseline (15 words, 1.5 syllables), plus the two excesses, is the grade.
  const baseline = 0.39 * 15 + 11.8 * 1.5 - 15.59;
  near(baseline + t.gradeFromSentences + t.gradeFromWords, t.grade, 1e-9);
});

test('headings and code are shown but not measured', () => {
  const { original } = analyse('# A Heading With No Full Stop\n\nOne short sentence here.\n\n```\nconst x = 1;\n```\n', {
    format: 'markdown',
  });
  assert.equal(original.totals.sentences, 1);
  assert.equal(original.totals.words, 4);
  assert.deepEqual(original.blocks.map((b) => b.type), ['heading', 'paragraph', 'pre']);
});

test('names, initialisms and numbers are not flagged as uncommon words', () => {
  const { original } = analyse(
    'Yesterday Priyamvada met Zbigniew in Thiruvananthapuram. The FBI and NASA sent 42 agents. Priyamvada left early.',
  );
  assert.deepEqual(original.totals.rareWords, []);
});

test('uncommon words are found, counted once per form, and marked on their tokens', () => {
  const { original } = analyse('We shall indemnify the licensor. You shall indemnify nobody, notwithstanding this.');
  assert.deepEqual(original.totals.rareWords, [
    { word: 'indemnify', count: 2 },
    { word: 'licensor', count: 1 },
    { word: 'notwithstanding', count: 1 },
  ]);
  const marked = original.blocks.flatMap((b) => b.sentences).flatMap((s) => s.tokens).filter((t) => t.rare);
  assert.equal(marked.length, 4);
});

test('a hyphenated word is everyday when each part is', () => {
  const { original } = analyse('This is a well-known, state-of-the-art, long-term plan for the non-refundable deposit.');
  assert.deepEqual(original.totals.rareWords.map((w) => w.word), ['non-refundable']);
});

test('SHOUTING is read as words, not as a row of initialisms', () => {
  const loud = analyse('PLEASE READ THESE TERMS CAREFULLY BEFORE YOU USE THE SERVICE.').original.totals;
  const quiet = analyse('Please read these terms carefully before you use the service.').original.totals;
  assert.equal(loud.syllables, quiet.syllables);
});

test('passive voice: found where it is, not where it is not', () => {
  const count = (text) => analyse(text).original.totals.passiveSentences;
  assert.equal(count('The form was signed by the clerk.'), 1);
  assert.equal(count('The bridge is being built slowly.'), 1);
  assert.equal(count('Permits that have expired will not be renewed.'), 1);
  assert.equal(count('The clerk signed the form.'), 0);
  assert.equal(count('She is tired and he is indeed late.'), 0);
  assert.equal(count('We are, as noted, decided.'), 0);
});

test('sentence-length bands add up to the number of sentences', () => {
  for (const s of SAMPLES) {
    const t = analyse(s.text).original.totals;
    const bands = lengthBands(t.lengths);
    assert.equal(bands.reduce((n, band) => n + band.count, 0), t.sentences, s.id);
    assert.equal(bands.filter((band) => band.long).reduce((n, band) => n + band.count, 0), t.over, s.id);
  }
});

test('diagnosis: each sample leads with the right problem', () => {
  const lead = (id) => analyse(sample(id)).diagnosis;
  assert.equal(lead('terms').issues[0].id, 'long-sentences');
  assert.equal(lead('terms').issues[0].level, 'severe');
  assert.equal(lead('declaration').issues[0].id, 'long-sentences');
  assert.ok(lead('circular').issues.some((issue) => issue.id === 'long-paragraphs'));
  assert.ok(lead('circular').issues.some((issue) => issue.id === 'passive'));
  // A tool that always complains is no use: the plain sample must come back clean.
  assert.deepEqual(lead('plain').issues, []);
  assert.ok(lead('plain').verdict.gradeNumber <= 4);
  assert.match(lead('plain').verdict.lead, /Nothing stands out/);
});

test('diagnosis: issues are sorted worst first and carry a matching level', () => {
  for (const s of SAMPLES) {
    const { issues } = analyse(s.text).diagnosis;
    for (let i = 1; i < issues.length; i++) assert.ok(issues[i - 1].severity >= issues[i].severity, s.id);
    for (const issue of issues) assert.ok(issue.severity > 0 && issue.severity <= 1, issue.id);
  }
});

test('diagnosis: the page itself can be the biggest problem', () => {
  const { diagnosis } = analyse(sample('plain'), { page: { lineLength: 150, fontSize: 12, contrast: 2.9, lineHeight: 1.15 } });
  assert.equal(diagnosis.issues[0].id, 'line-length');
  assert.match(diagnosis.verdict.lead, /The page is the problem more than the words/);
  assert.deepEqual(diagnosis.issues.map((issue) => issue.id).sort(), ['line-length', 'low-contrast', 'small-text', 'tight-lines']);
  const fine = analyse(sample('plain'), { page: { lineLength: 70, fontSize: 18, contrast: 12, lineHeight: 1.6 } }).diagnosis;
  assert.deepEqual(fine.issues, []);
});

test('diagnosis: short or empty input is handled honestly', () => {
  assert.equal(analyse('').diagnosis.verdict, null);
  assert.equal(analyse('   \n\n  ').diagnosis.notes[0].id, 'empty');
  assert.ok(analyse('Too short to judge. Really.').diagnosis.notes.some((note) => note.id === 'short'));
});

test('diagnosis: text that is not English is called out', () => {
  const tamil = 'Ceci est un texte en français qui explique comment emprunter des livres à la bibliothèque municipale. ' +
    'Il suffit de présenter une pièce d’identité et un justificatif de domicile au guichet pour obtenir une carte. ' +
    'Vous pouvez ensuite emporter jusqu’à dix ouvrages pendant trois semaines sans aucun frais supplémentaires.';
  assert.ok(analyse(tamil).diagnosis.notes.some((note) => note.id === 'language'));
  assert.ok(!analyse(sample('plain')).diagnosis.notes.some((note) => note.id === 'language'));
});

test('parsing: pasted text with single line breaks, lists and a title', () => {
  const { blocks, title } = parseText('Library rules\n\nYou can borrow ten books at a time, for three weeks at a stretch, free of charge.\n- Bring your card.\n- Return books on time.');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'list', 'list']);
  assert.equal(title, 'Library rules');
  assert.equal(blocks[2].text, 'Bring your card.');
});

test('parsing: hard-wrapped text is rejoined into paragraphs', () => {
  const wrapped = [
    'This paragraph was wrapped at a fixed width by an email',
    'client, so every line stops in the middle of a sentence',
    'and the next line simply carries on from where it ended.',
    '',
    'A second paragraph follows the same pattern, with lines',
    'that are all about the same length as each other, which',
    'is the tell-tale sign that the breaks are not meaningful.',
  ].join('\n');
  const { blocks } = parseText(wrapped);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].text, /email client, so every line/);
});

test('parsing: Markdown is reduced to its prose', () => {
  const md = [
    '# Title',
    '',
    'Some **bold** and *soft* text with a [link](https://example.com) and `npm test` in it.',
    '',
    '![screenshot](shot.png)',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '1. First item',
    '2. Second item',
    '',
    '> A quoted line.',
  ].join('\n');
  const { blocks, format } = parseText(md);
  assert.equal(format, 'markdown');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'pre', 'list', 'list', 'quote']);
  assert.equal(blocks[1].text.replace(/[]/g, '|'), 'Some bold and soft text with a link and |npm test| in it.');
  assert.equal(blocks[3].ordered, true);
  // Code is kept out of the word count: "npm" must not be reported as an uncommon word.
  assert.deepEqual(analyse(md).original.totals.rareWords, []);
});
