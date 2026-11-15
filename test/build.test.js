import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fromBookmarklet, toBookmarklet } from '../tools/lib/bookmarklet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('bookmarklet: encoding survives the way a browser decodes it', () => {
  const awkward = 'a{width:100%25}b{color:#fff}/* 50% #x */ "q" \n\t café → %41';
  assert.equal(fromBookmarklet(toBookmarklet(awkward)), awkward);
  assert.ok(!/[\n\t#]/.test(toBookmarklet(awkward)), 'no line breaks, tabs or # left in the address');
});

test('bookmarklet: the built bookmark is the built script, and nothing else', () => {
  const address = read('dist/bookmarklet.txt').trim();
  const script = read('dist/legible.page.js').trim();
  assert.equal(fromBookmarklet(address), script);
  assert.ok(!/[\u0000-\u001f]/.test(address), 'no control characters');
});

test('bookmarklet: it stays small enough to be one bookmark', () => {
  const address = read('dist/bookmarklet.txt').trim();
  // Chrome, Edge and Safari take a bookmark this size. Firefox stops at 65,536 characters,
  // which is why the page also offers a small loader. This guard is against bloat.
  assert.ok(address.length < 115_000, `${address.length} characters`);
});

test('bookmarklet: it asks nothing of the network and never writes HTML', () => {
  const script = read('dist/legible.page.js');
  for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) {
    assert.ok(!script.includes(banned), `the bundle contains ${banned}`);
  }
});

/** Follow every import from the page's entry point. */
function importedFrom(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const match of read(entry).matchAll(/from\s+'(\.[^']+)'/g)) {
    importedFrom(posix.join(posix.dirname(entry), match[1]), seen);
  }
  return seen;
}

test('offline: the service worker keeps every file the page loads', () => {
  const sw = read('sw.js');
  const files = JSON.parse(/const FILES = (\[[^\]]*\]);/.exec(sw)[1]);
  const needed = [...importedFrom('src/app/main.js'), 'src/ui/reader.css', 'src/app/app.css', 'index.html', 'manifest.webmanifest'];
  assert.deepEqual(needed.filter((file) => !files.includes(file)), [], 'run `npm run build` after adding a file');
  assert.deepEqual(files.filter((file) => file !== './' && !existsSync(join(root, file))), [], 'listed but missing');
});

test('offline: the page itself loads nothing from another site', () => {
  const html = read('index.html');
  const outside = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  // Links a person may choose to follow are fine. Anything the page fetches by itself is not.
  const fetched = [...html.matchAll(/<(?:script|link|img|iframe)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(fetched, []);
  assert.ok(outside.every((url) => url.startsWith('https://github.com/')));
  const csp = JSON.parse(read('vercel.json')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.ok(!csp.includes('unsafe'), 'no unsafe-inline, no unsafe-eval');
});
