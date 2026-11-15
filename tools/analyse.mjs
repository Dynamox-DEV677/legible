/**
 * Legible on the command line: the same analyser the app uses, pointed at a file.
 *
 *   node tools/analyse.mjs README.md          diagnosis as text
 *   node tools/analyse.mjs notes.txt --fix    also show what the fixes would change
 *   node tools/analyse.mjs notes.txt --json   the raw numbers
 *
 * `npm run self-check` runs it on this project's own README.
 */

import { readFileSync } from 'node:fs';
import { analyse, lengthBands, LIMITS } from '../src/core/index.js';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error('usage: node tools/analyse.mjs <file.txt|file.md> [--fix] [--json]');
  process.exit(2);
}
const fix = args.includes('--fix');
const format = /\.(?:md|markdown)$/i.test(file) ? 'markdown' : 'auto';
const { original, diagnosis, view, after } = analyse(readFileSync(file, 'utf8'), {
  format,
  fixes: fix ? { split: true, chunk: true } : {},
});
const t = original.totals;

if (args.includes('--json')) {
  const { rareWords, lengths, ...numbers } = t;
  console.log(JSON.stringify({ file, totals: numbers, lengths, rareWords, diagnosis }, null, 2));
  process.exit(0);
}
if (!diagnosis.verdict) {
  console.log(diagnosis.notes[0].text);
  process.exit(0);
}

const { verdict } = diagnosis;
const out = [];
out.push(file, '');
out.push(`${verdict.headline} ${verdict.audience}`);
out.push(verdict.lead);
if (verdict.breakdown) out.push(verdict.breakdown);
out.push('');
out.push(
  `Flesch-Kincaid grade ${t.grade.toFixed(1)} · Flesch reading ease ${t.ease.toFixed(0)} (${verdict.easeLabel})`,
  `${t.words} words · ${t.sentences} sentences · ${t.wordsPerSentence.toFixed(1)} words per sentence · ` +
    `${t.syllablesPerWord.toFixed(2)} syllables per word · about ${Math.max(1, Math.round(t.minutes))} min to read`,
);
for (const note of diagnosis.notes) out.push('', `Note: ${note.text}`);

if (diagnosis.issues.length) {
  out.push('', 'What makes it hard, worst first:');
  diagnosis.issues.forEach((issue, i) => {
    out.push(`  ${i + 1}. ${issue.title} [${issue.level}]`, `     ${issue.finding}`, `     ${issue.detail}`);
  });
}
if (diagnosis.fine.length) {
  out.push('', 'What is fine:');
  for (const line of diagnosis.fine) out.push(`  - ${line}`);
}

out.push('', 'Words per sentence:');
const bands = lengthBands(t.lengths);
const widest = Math.max(1, ...bands.map((band) => band.count));
for (const band of bands) {
  const bar = '#'.repeat(Math.round((band.count / widest) * 30));
  out.push(`  ${band.label.padStart(5)} ${String(band.count).padStart(4)} ${bar}${band.long && band.count ? `  over ${LIMITS.sentence}` : ''}`);
}

if (t.rareWords.length) {
  out.push('', `Uncommon words (${t.rareWords.length} different):`);
  out.push('  ' + t.rareWords.slice(0, 40).map((entry) => (entry.count > 1 ? `${entry.word} ×${entry.count}` : entry.word)).join(', '));
}

if (fix && after) {
  const v = view.totals;
  out.push('', 'After splitting long sentences and breaking up long paragraphs:');
  out.push(
    `  grade ${t.grade.toFixed(1)} → ${v.grade.toFixed(1)}, ` +
      `sentences over ${LIMITS.sentence} words ${t.over} → ${v.over}, ` +
      `longest sentence ${t.longest} → ${v.longest} words, ` +
      `paragraphs over ${LIMITS.paragraph} words ${t.longParagraphs} → ${v.longParagraphs}`,
  );
  out.push('  Same words in the same order. Only punctuation, capitals and paragraph breaks change.');
  for (const block of view.blocks) {
    for (const sentence of block.sentences) {
      if (sentence.split && sentence.split.part === 1) {
        const parts = block.sentences.filter((s) => s.split && s.split.id === sentence.split.id);
        out.push('', `  was: ${sentence.split.original}`);
        for (const part of parts) out.push(`  now: ${part.text}`);
      }
    }
  }
}
console.log(out.join('\n'));
