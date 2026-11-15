/**
 * Read a web page: find the article, turn it into blocks, and measure how the page set
 * its type. Used by the bookmarklet on live pages and by the app on .html files.
 *
 * It only reads. Nothing on the page is changed.
 */

import { blend, contrastRatio, parseColor } from '../core/contrast.js';
import { CODE_CLOSE, CODE_OPEN } from '../core/segment.js';

const SKIP = new Set(
  'SCRIPT STYLE NOSCRIPT TEMPLATE SVG CANVAS IFRAME OBJECT EMBED VIDEO AUDIO NAV ASIDE FOOTER FORM BUTTON SELECT TEXTAREA INPUT DIALOG MENU FIGURE MAP'.split(' '),
);
const BLOCK = new Set(
  'ADDRESS ARTICLE BLOCKQUOTE CENTER DD DETAILS DIV DL DT FIELDSET FIGCAPTION H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN OL P PRE SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL'.split(' '),
);
/**
 * Class and id names that mark page furniture rather than the article: menus, share
 * buttons, comment threads, and the reference lists, edit links and category boxes that
 * wikis and journals put around their prose.
 */
const FURNITURE =
  /(?:^|[\s_-])(?:share|social|related|comments?|advert|ads?|promo|cookie|newsletter|breadcrumbs?|sidebar|menu|nav|navbox|toolbar|popup|modal|noprint|editsection|sitesub|catlinks|reflist|references|refbegin|footnotes|hatnote|metadata|printfooter|infobox|toc)(?:$|[\s_-])/i;
const MAIN = 'article, main, [role="main"], [itemprop="articleBody"]';

const clean = (text) =>
  text
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[   -   　]/g, ' ');
const tidy = (text) => text.replace(/\s+/g, ' ').replace(/\.(?: \.){2,}/g, '…').trim();

function isFurniture(el) {
  if (SKIP.has(el.tagName) || el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  const names = `${typeof el.className === 'string' ? el.className : ''} ${el.id || ''}`;
  return names.length > 1 && FURNITURE.test(names);
}

/** Pick the element that holds the article. */
function findArticle(doc) {
  const body = doc.body || doc.documentElement;
  // Score every container by the paragraph text directly inside it, as reader modes do.
  const scores = new Map();
  const bump = (el, by) => el && el !== doc.documentElement && scores.set(el, (scores.get(el) || 0) + by);
  for (const p of body.querySelectorAll('p')) {
    const length = p.textContent.trim().length;
    if (length < 60 || p.closest('nav, aside, footer, form')) continue;
    bump(p.parentElement, length);
    bump(p.parentElement && p.parentElement.parentElement, length / 2);
  }
  let best = body;
  let bestScore = 0;
  for (const [el, score] of scores) {
    if (score > bestScore) [best, bestScore] = [el, score];
  }
  // Prefer a real <article> or <main> when it holds most of that text anyway.
  let named = null;
  let namedLength = 0;
  for (const el of body.querySelectorAll(MAIN)) {
    const length = el.textContent.length;
    if (length > namedLength) [named, namedLength] = [el, length];
  }
  if (named && (named.contains(best) || namedLength >= best.textContent.length * 0.6)) return named;
  return best;
}

/**
 * Walk a subtree and collect blocks.
 * @param {Node} rootNode
 * @param {(el: Element) => boolean} visible
 * @returns {{ blocks: object[], paragraphs: Element[] }}
 */
function collect(rootNode, visible) {
  const blocks = [];
  const paragraphs = [];
  let buffer = '';
  let breaks = 0;

  const flush = (type, owner, extra) => {
    const text = tidy(buffer);
    buffer = '';
    breaks = 0;
    if (text.length < 2 || !/[\p{L}\p{N}]/u.test(text)) return;
    blocks.push({ type, text, ...extra });
    if (type === 'paragraph' && owner && owner.nodeType === 1) paragraphs.push(owner);
  };

  /** Text of inline content, with code marked and footnote numbers dropped. */
  const inline = (node) => {
    if (node.nodeType === 3) {
      buffer += clean(node.nodeValue);
      breaks = 0;
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      buffer += ' ';
      breaks++;
      return;
    }
    if (isFurniture(node) || tag === 'IMG' || tag === 'PICTURE') return;
    if (tag === 'SUP' && /^\[?[\d,\s]*\]?$/.test(node.textContent.trim())) return; // footnote marks
    if ((tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') && node.textContent.trim()) {
      buffer += CODE_OPEN + tidy(clean(node.textContent)) + CODE_CLOSE;
      return;
    }
    for (const child of node.childNodes) inline(child);
  };

  /** A block that is nothing but one short link: "Skip to content", "Read more". */
  const isLoneLink = (el) => {
    const only = el.children.length === 1 ? el.firstElementChild : null;
    if (!only || only.tagName !== 'A') return false;
    const text = tidy(el.textContent);
    return text.length < 60 && text === tidy(only.textContent);
  };

  /** Mostly links and little else: a menu or a "related articles" list. */
  const isLinkList = (el) => {
    const total = el.textContent.trim().length;
    if (total < 20 || el.children.length < 3) return false;
    let linked = 0;
    for (const a of el.querySelectorAll('a')) linked += a.textContent.trim().length;
    return linked / total > 0.6;
  };

  const walk = (el, context) => {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        buffer += clean(child.nodeValue);
        if (child.nodeValue.trim()) breaks = 0;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (!BLOCK.has(tag)) {
        // Two line breaks in a row are a paragraph break in older markup.
        if (tag === 'BR' && breaks >= 1) flush(context.type, el, context.extra);
        else inline(child);
        continue;
      }
      if (isFurniture(child) || !visible(child) || isLoneLink(child)) continue;
      flush(context.type, el, context.extra);
      if (/^H[1-6]$/.test(tag)) {
        inline(child);
        flush('heading', null, { level: Number(tag[1]) });
      } else if (tag === 'PRE') {
        const text = clean(child.textContent).replace(/\s+$/, '');
        if (text.trim()) blocks.push({ type: 'pre', text });
      } else if (tag === 'UL' || tag === 'OL') {
        if (!isLinkList(child)) walk(child, { type: 'list', extra: { ordered: tag === 'OL' } });
      } else if (tag === 'LI') {
        walk(child, context.type === 'list' ? context : { type: 'list', extra: { ordered: false } });
        flush('list', null, context.extra || { ordered: false });
      } else if (tag === 'BLOCKQUOTE') {
        walk(child, { type: 'quote' });
        flush('quote', null);
      } else if (tag === 'TABLE') {
        walk(child, { type: 'paragraph', table: true });
      } else if (tag === 'TD' || tag === 'TH') {
        walk(child, context);
        // A table cell is prose only if it is long. Short cells are data.
        if (tidy(buffer).length >= 60) flush('paragraph', child);
        else buffer = '';
      } else if (tag !== 'HR') {
        walk(child, tag === 'P' ? { type: context.type === 'quote' ? 'quote' : 'paragraph' } : context);
        flush(context.type === 'list' || context.type === 'quote' ? context.type : 'paragraph', child, context.extra);
      }
    }
  };

  walk(rootNode, { type: 'paragraph' });
  flush('paragraph', rootNode.nodeType === 1 ? rootNode : null);

  // A heading with nothing under it is left over from a section we skipped ("References").
  const kept = blocks.filter((block, i) => {
    if (block.type !== 'heading' || i === 0) return true;
    const next = blocks.slice(i + 1).find((later) => later.type !== 'heading' || later.level <= block.level);
    return Boolean(next) && next.type !== 'heading';
  });
  return { blocks: kept, paragraphs };
}

const median = (values) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** The solid colour behind an element, or null if a picture or gradient is in the way. */
function backgroundOf(el, view) {
  const layers = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.backgroundImage && style.backgroundImage !== 'none') return null;
    const colour = parseColor(style.backgroundColor);
    if (colour && colour[3] > 0) {
      layers.push(colour);
      if (colour[3] >= 1) break;
    }
  }
  let solid = [255, 255, 255, 1]; // the browser's own canvas
  for (const layer of layers.reverse()) solid = blend(layer, solid);
  return solid;
}

/**
 * How the page set its body text: size, line spacing, line length and contrast.
 * Each figure is the median over the page's longer paragraphs.
 */
function measureTypography(paragraphs, view) {
  const sizes = [];
  const leadings = [];
  const widths = [];
  const ratios = [];
  for (const el of paragraphs.slice(0, 40)) {
    const length = tidy(el.textContent).length;
    if (length < 80) continue;
    const style = view.getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    if (!size) continue;
    const leading = parseFloat(style.lineHeight) || size * 1.2; // "normal" is about 1.2
    sizes.push(size);
    leadings.push(leading / size);
    const lines = Math.round(el.getBoundingClientRect().height / leading);
    if (lines >= 3) widths.push(length / (lines - 0.5)); // the last line is half full on average
    const colour = parseColor(style.color);
    const background = backgroundOf(el, view);
    if (colour && background) ratios.push(contrastRatio(blend(colour, background), background));
  }
  if (!sizes.length) return null;
  return {
    fontSize: median(sizes),
    lineHeight: median(leadings),
    lineLength: median(widths),
    contrast: median(ratios),
    samples: sizes.length,
  };
}

/**
 * @param {Document} doc
 * @param {{ live?: boolean }} [options] `live` is false for a parsed file, which has no
 *   layout to measure and no selection
 * @returns {{ blocks: object[], title: string, lang: string, page: object | null, from: string }}
 */
export function extractPage(doc, { live = true } = {}) {
  const view = doc.defaultView;
  const visible = (el) => {
    if (!live || !view) return true;
    const style = view.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const host = live && view && view.location ? view.location.hostname : '';
  const lang = (doc.documentElement.getAttribute('lang') || '').trim();
  let title = tidy(doc.title || '');

  // Text the reader has selected takes priority: "read just this part".
  const selection = live && doc.getSelection ? doc.getSelection() : null;
  if (selection && !selection.isCollapsed && String(selection).trim().length >= 40) {
    const { blocks } = collect(selection.getRangeAt(0).cloneContents(), () => true);
    if (blocks.length) return { blocks, title, lang, page: null, from: `Selected text${host ? ` on ${host}` : ''}.` };
  }

  const article = findArticle(doc);
  let { blocks, paragraphs } = collect(article, visible);
  if (!blocks.some((block) => block.type !== 'heading') && article !== doc.body && doc.body) {
    ({ blocks, paragraphs } = collect(doc.body, visible));
  }
  // A page title usually carries the site name: "Article - Section - Site". Keep the first part.
  const lead = title.split(/\s+[|\-–—·»:]\s+/)[0];
  if (lead.length >= 12) title = lead;
  // If the page already opens with that heading, use it. Otherwise put the title on top.
  const key = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const first = blocks[0] && blocks[0].type === 'heading' ? blocks[0] : null;
  const firstH1 = blocks.find((block) => block.type === 'heading' && block.level === 1);
  if (firstH1) {
    title = firstH1.text;
  } else if (first && title && (key(title).includes(key(first.text)) || key(first.text).includes(key(title)))) {
    first.level = 1;
    title = first.text.length >= title.length ? first.text : title;
    first.text = title;
  } else if (title) {
    blocks.unshift({ type: 'heading', level: 1, text: title });
  }

  return {
    blocks,
    title,
    lang,
    page: live && view ? measureTypography(paragraphs, view) : null,
    from: host ? `From ${host}.` : '',
  };
}
