/**
 * Draw the text. Every word gets its own element, which is what lets read-aloud light up
 * the spoken word, lets a click start reading from that word, and lets the marks
 * (uncommon word, passive voice) sit on exactly the right letters.
 */

import { clear, h } from './dom.js';

const MARKERS = /[]/g;

/**
 * @param {HTMLElement} article
 * @param {ReturnType<import('../core/measure.js').measure>} view the measured document
 * @param {{ headingOffset: number }} options how many levels to push the text's headings
 *   down so they sit under the reader's own
 * @returns {{
 *   spoken: { text: string, words: { start: number, end: number }[] }[],
 *   sentenceEls: HTMLElement[],
 *   wordEls: HTMLElement[][],
 *   where: Map<Element, [number, number]>,
 * }} what the speaker needs, and a way back from a clicked word to its place
 */
export function renderArticle(article, view, { headingOffset }) {
  clear(article);
  const spoken = [];
  const sentenceEls = [];
  const wordEls = [];
  const where = new Map();

  const drawSentence = (sentence) => {
    const index = spoken.length;
    const span = h('span', { class: sentence.long ? 's lg-long' : 's' });
    if (sentence.long) span.append(h('span', { class: 'lg-tag' }, `${sentence.words} words`));
    const words = [];
    const els = [];
    const passive = sentence.passive || [];
    let cursor = 0;
    for (const t of sentence.tokens) {
      if (t.start > cursor) span.append(sentence.text.slice(cursor, t.start));
      cursor = t.end;
      if (t.kind === 'note') {
        span.append(t.text);
        continue;
      }
      let el;
      if (t.kind === 'code') {
        el = h('code', { class: 'w' }, t.text.replace(MARKERS, ''));
      } else {
        let cls = 'w';
        if (t.rare) cls += ' lg-rare';
        if (passive.some((p) => t.start >= p.start && t.end <= p.end)) cls += ' lg-pv';
        el = h('span', { class: cls }, t.text);
      }
      where.set(el, [index, els.length]);
      els.push(el);
      words.push({ start: t.start, end: t.end });
      span.append(el);
    }
    if (cursor < sentence.text.length) span.append(sentence.text.slice(cursor));
    // The spoken text keeps its length, so word positions stay true: markers become spaces.
    spoken.push({ text: sentence.text.replace(MARKERS, ' '), words });
    sentenceEls.push(span);
    wordEls.push(els);
    return span;
  };

  const cutButton = (id, parts, kept) =>
    h(
      'button',
      {
        type: 'button',
        class: 'lg-cut',
        'data-cut': id,
        'data-key': `cut:${id}`,
        'aria-pressed': kept ? 'false' : 'true',
        'aria-label': kept
          ? 'This long sentence is shown as written. Split it.'
          : `Legible split this sentence into ${parts}. Show it as written.`,
      },
      kept ? 'as written' : 'split',
    );

  let list = null;
  for (const block of view.blocks) {
    if (block.type !== 'list') list = null;
    if (block.type === 'pre') {
      article.append(h('pre', { tabindex: '0', 'aria-label': 'Code or table, not measured' }, block.text.replace(MARKERS, '')));
      continue;
    }
    const nodes = [];
    block.sentences.forEach((sentence, i) => {
      if (i) nodes.push(' ');
      if (sentence.split && sentence.split.part === 1) nodes.push(cutButton(sentence.split.id, sentence.split.of, false));
      else if (sentence.kept) nodes.push(cutButton(sentence.id, 0, true));
      nodes.push(drawSentence(sentence));
    });

    if (block.type === 'list') {
      const ordered = Boolean(block.ordered);
      if (!list || list.ordered !== ordered) {
        list = { ordered, el: h(ordered ? 'ol' : 'ul') };
        article.append(list.el);
      }
      list.el.append(h('li', null, nodes));
    } else if (block.type === 'heading') {
      article.append(h(`h${Math.min(6, (block.level || 2) + headingOffset)}`, null, nodes));
    } else if (block.type === 'quote') {
      article.append(h('blockquote', null, h('p', null, nodes)));
    } else {
      article.append(h('p', { class: block.chunk && block.chunk.part > 1 ? 'lg-chunk' : null }, nodes));
    }
  }
  return { spoken, sentenceEls, wordEls, where };
}
