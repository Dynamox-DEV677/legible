/**
 * Copy the files that make up the website into another folder, ready to upload to any
 * static host.
 *
 *   node tools/stage.mjs ../legible-site
 *
 * The list of files is read from sw.js, so the site that is uploaded is exactly the site
 * that is saved for offline use. Run `npm run build` first. Anything already in the
 * target folder is replaced, except dot-folders such as .vercel, which hold the host's
 * own link to the project.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ? resolve(process.argv[2]) : null;
if (!target) {
  console.error('usage: node tools/stage.mjs <folder>');
  process.exit(2);
}
if (target === resolve(root) || target.startsWith(resolve(root) + '\\') || target.startsWith(resolve(root) + '/')) {
  console.error('The target must be outside this repository.');
  process.exit(2);
}

const listed = JSON.parse(/const FILES = (\[[^\]]*\]);/.exec(readFileSync(join(root, 'sw.js'), 'utf8'))[1]);
const files = [...listed.filter((file) => file !== './'), 'sw.js', 'vercel.json'];

mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) {
  if (!name.startsWith('.')) rmSync(join(target, name), { recursive: true, force: true });
}
for (const file of files) {
  if (!existsSync(join(root, file))) throw new Error(`missing ${file}: run npm run build`);
  mkdirSync(dirname(join(target, file)), { recursive: true });
  cpSync(join(root, file), join(target, file));
}
console.log(`${files.length} files copied to ${target}`);
