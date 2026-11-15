/**
 * A small static server for local development. No dependencies.
 *
 *   node tools/serve.mjs [port]
 *
 * It sends the same security headers as the deployed site (see vercel.json), so anything
 * the Content Security Policy would block in production is blocked here first.
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

let headers = {};
try {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  for (const rule of config.headers || []) {
    if (rule.source === '/(.*)') for (const { key, value } of rule.headers) headers[key] = value;
  }
} catch {
  headers = {};
}

createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (path !== root && !path.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  response.writeHead(200, {
    ...headers,
    'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(path).pipe(response);
}).listen(port, () => {
  console.log(`Legible is at http://localhost:${port}`);
});
