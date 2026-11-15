/**
 * Turn pasted text or Markdown into blocks: headings, paragraphs, list items, quotes and
 * preformatted chunks. Only paragraphs, list items and quotes are measured. A heading is
 * a label, not a sentence, and counting it as one would flatter every score.
 *
 * @typedef {{
 *   type: 'heading' | 'paragraph' | 'list' | 'quote' | 'pre',
 *   text: string,
 *   level?: number,
 *   ordered?: boolean,
 * }} Block
 */

import { CODE_CLOSE, CODE_OPEN } from './segment.js';

/** Tidy characters that look like nothing but break word and sentence matching. */
export function normalise(raw) {
  return String(raw)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍⁠﻿­]/g, '') // zero-width characters, soft hyphens
    .replace(/[   -   　]/g, ' ') // every kind of space
    .replace(/\t/g, '    ');
}

const tidy = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\.(?: \.){2,}/g, '…') // ". . ." is an ellipsis, not three sentences
    .trim();

const ENDS_LIKE_A_SENTENCE = /[.!?;:,…]["'”’)\]]*$/;
const LIST_MARK = /^(?:([-*•·‣▪◦–—])|(?:\d{1,3}|[a-z])[.)]|[A-Z]\)|\((?:\d{1,3}|[a-z]|[ivx]{1,4})\))\s+(?=\S)/;

/* ------------------------------------------------------------------------------------
 * Plain text
 * ---------------------------------------------------------------------------------- */

/**
 * Text copied from an email or a PDF is often wrapped at a fixed width, so a line break
 * does not mean a new paragraph. Detected when most lines are nearly full width and stop
 * mid-sentence.
 */
function isHardWrapped(lines) {
  const lengths = lines.filter(Boolean).map((line) => line.length).sort((a, b) => a - b);
  if (lengths.length < 6) return false;
  const width = lengths[Math.floor(lengths.length * 0.9)];
  if (width < 40 || width > 100) return false;
  let pairs = 0;
  let full = 0;
  let open = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i] || !lines[i + 1]) continue;
    pairs++;
    if (lines[i].length >= width * 0.72) full++;
    if (!/[.!?:;]["')\]]*$/.test(lines[i])) open++;
  }
  return pairs >= 4 && full / pairs >= 0.6 && open / pairs >= 0.5;
}

function plainBlock(text) {
  const mark = LIST_MARK.exec(text);
  if (mark) return { type: 'list', ordered: !mark[1], text: tidy(text.slice(mark[0].length)) };
  return { type: 'paragraph', text: tidy(text) };
}

function parsePlain(text) {
  const lines = text.split('\n').map((line) => line.trim());
  const wrapped = isHardWrapped(lines);
  /** @type {(Block & { lines: number })[]} */
  const blocks = [];
  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const block = plainBlock(buffer.join(' '));
    if (block.text) blocks.push({ ...block, lines: buffer.length });
    buffer = [];
  };
  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (!wrapped || LIST_MARK.test(line)) flush();
    buffer.push(line);
  }
  flush();

  // A short line with no closing punctuation, sitting above a real paragraph, is a heading.
  blocks.forEach((block, i) => {
    const next = blocks[i + 1];
    const short = block.text.length <= 80 && block.text.split(' ').length <= 12;
    if (block.type !== 'paragraph' || block.lines > 1 || !short || ENDS_LIKE_A_SENTENCE.test(block.text)) return;
    if (next && (next.type === 'list' || next.text.length >= 80)) {
      block.type = 'heading';
      block.level = i === 0 ? 1 : 2;
    }
  });
  return blocks.map(({ lines: _lines, ...block }) => block);
}

/* ------------------------------------------------------------------------------------
 * Markdown
 * ---------------------------------------------------------------------------------- */

/** True when the text carries enough Markdown syntax that reading it as prose would be wrong. */
export function looksLikeMarkdown(text) {
  let score = 0;
  if (/^#{1,6} \S/m.test(text)) score += 2;
  if (/^(?:```|~~~)/m.test(text)) score += 2;
  if (/\[[^\]\n]+\]\([^)\s]+\)/.test(text)) score += 2;
  if (/^\s*[-*+] \S/m.test(text)) score += 1;
  if (/\*\*[^*\n]+\*\*/.test(text)) score += 1;
  if (/`[^`\n]+`/.test(text)) score += 1;
  if (/^\|.+\|\s*$/m.test(text)) score += 1;
  return score >= 3;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function inlineProse(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images carry no text to read
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](link) → text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<(https?:[^>\s]+)>/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name) => ENTITIES[name]);
}

/** Strip inline Markdown, keeping `code spans` marked so they stay out of the word counts. */
function inline(text) {
  const parts = text.split(/(`+)([^`]|[^`].*?[^`])\1(?!`)/);
  // split() with two groups yields: prose, ticks, code, prose, ticks, code, …
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    out += inlineProse(parts[i]);
    if (parts[i + 2] !== undefined) out += CODE_OPEN + parts[i + 2].trim() + CODE_CLOSE;
  }
  return tidy(out.replace(/^\[[ xX]\]\s+/, ''));
}

function parseMarkdown(text) {
  const lines = text.split('\n');
  /** @type {Block[]} */
  const blocks = [];
  let para = [];
  let quote = false;
  let item = null;

  const flush = () => {
    if (para.length) {
      const body = inline(para.join(' '));
      if (body) blocks.push({ type: quote ? 'quote' : 'paragraph', text: body });
    }
    if (item) {
      const body = inline(item.lines.join(' '));
      if (body) blocks.push({ type: 'list', ordered: item.ordered, text: body });
    }
    para = [];
    item = null;
    quote = false;
  };

  let i = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    // YAML front matter
    const close = lines.indexOf('---', 1);
    if (close > 0) i = close + 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      flush();
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      blocks.push({ type: 'pre', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      while (i < lines.length && !lines[i].includes('-->')) i++;
      continue;
    }
    if (/^\s*\[[^\]]+\]:\s+\S/.test(line)) continue; // link reference definition

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const body = inline(heading[2]);
      if (body) blocks.push({ type: 'heading', level: heading[1].length, text: body });
      continue;
    }
    if (/^\s{0,3}(?:=+|-+)\s*$/.test(line) && para.length === 1 && !item) {
      // Setext heading: a line of text underlined with === or ---
      const body = inline(para[0]);
      para = [];
      flush();
      if (body) blocks.push({ type: 'heading', level: line.includes('=') ? 1 : 2, text: body });
      continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flush(); // horizontal rule
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i].trim());
      i--;
      blocks.push({ type: 'pre', text: rows.join('\n') });
      continue;
    }
    if (/^\s*(?:<\/?[a-zA-Z][^>]*>\s*)+$/.test(line)) continue; // a line that is only HTML tags

    const listItem = /^\s*([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      flush();
      item = { ordered: /\d/.test(listItem[1]), lines: [listItem[2]] };
      continue;
    }
    const quoted = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (quoted) {
      if (!quote || item) flush();
      quote = true;
      if (quoted[1].trim()) para.push(quoted[1].trim());
      continue;
    }
    if (item) item.lines.push(line.trim());
    else {
      if (quote) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/* ------------------------------------------------------------------------------------ */

/**
 * @param {string} raw pasted text, a .txt file or a Markdown file
 * @param {{ format?: 'auto' | 'text' | 'markdown' }} [options]
 * @returns {{ blocks: Block[], title: string, format: 'text' | 'markdown' }}
 */
export function parseText(raw, { format = 'auto' } = {}) {
  const text = normalise(raw);
  const markdown = format === 'markdown' || (format === 'auto' && looksLikeMarkdown(text));
  const blocks = markdown ? parseMarkdown(text) : parsePlain(text);
  const first = blocks.find((block) => block.type === 'heading');
  return { blocks, title: first ? first.text.replace(/[]/g, '') : '', format: markdown ? 'markdown' : 'text' };
}
