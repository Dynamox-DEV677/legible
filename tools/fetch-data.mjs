/**
 * Download the two upstream datasets Legible's bundled data is built from.
 *
 *   node tools/fetch-data.mjs
 *
 * They land in .cache/, which is git-ignored: only the small derived files are committed.
 * Licences and attribution are in data/README.md.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');

const SOURCES = [
  {
    file: 'en_50k.txt',
    what: 'FrequencyWords: OpenSubtitles 2018 English word frequencies (CC BY-SA 4.0)',
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt',
  },
  {
    file: 'cmudict.dict',
    what: 'CMU Pronouncing Dictionary (BSD licence)',
    url: 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict',
  },
];

mkdirSync(cache, { recursive: true });
for (const { file, what, url } of SOURCES) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(cache, file), bytes);
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB  sha256 ${sha}…  ${what}`);
}
