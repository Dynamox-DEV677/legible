/**
 * Measure the syllable heuristic against the CMU Pronouncing Dictionary.
 *
 *   node tools/eval-syllables.mjs <cmudict.dict> <frequency-list> [topN] [--errors=40]
 *
 * Both files are upstream datasets fetched by tools/fetch-data.mjs. A word counts as
 * correct when the heuristic matches any pronunciation the dictionary lists.
 */

import { readFileSync } from 'node:fs';
import { heuristicSyllables, countSyllables } from '../src/core/syllables.js';
import { agrees, loadCmuSyllables, loadFrequencyList } from './lib/datasets.mjs';

const [cmuPath, freqPath, topArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const errorsToShow = Number((process.argv.find((a) => a.startsWith('--errors=')) || '--errors=40').slice(9));
if (!cmuPath || !freqPath) {
  console.error('usage: node tools/eval-syllables.mjs <cmudict.dict> <frequency-list> [topN]');
  process.exit(2);
}

const cmu = loadCmuSyllables(readFileSync(cmuPath, 'utf8'));
const words = loadFrequencyList(readFileSync(freqPath, 'utf8')).slice(0, Number(topArg) || 20000);

for (const [label, fn] of [
  ['rules only', heuristicSyllables],
  ['rules + exception table', countSyllables],
]) {
  let seen = 0;
  let right = 0;
  let weight = 0;
  let weightRight = 0;
  const wrong = [];
  for (const { word, count } of words) {
    const truth = cmu.get(word);
    if (!truth) continue;
    const got = fn(word);
    seen++;
    weight += count;
    if (agrees(word, got, truth)) {
      right++;
      weightRight += count;
    } else {
      wrong.push({ word, got, want: [...truth].join('/'), count });
    }
  }
  console.log(`\n${label}: ${right}/${seen} words = ${((100 * right) / seen).toFixed(2)}%`);
  console.log(`  weighted by how often each word is used: ${((100 * weightRight) / weight).toFixed(3)}%`);
  if (label === 'rules only' && errorsToShow) {
    console.log(`  most frequent misses (word got→want):`);
    console.log('  ' + wrong.slice(0, errorsToShow).map((e) => `${e.word} ${e.got}→${e.want}`).join(', '));
  }
}
