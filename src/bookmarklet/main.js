/**
 * The bookmarklet: all of Legible, opened on top of whatever page you are on.
 *
 * It reads the page, then draws the reader inside a shadow root so that the page's styles
 * cannot leak in and Legible's cannot leak out. Nothing on the page is rewritten, so
 * closing the reader puts everything back exactly as it was. It makes no network request.
 *
 * It is built to run where pages lock things down: no innerHTML (Trusted Types), no
 * <style> tags or style attributes (Content Security Policy), no scripts fetched from
 * anywhere. See tools/build.mjs for how this file becomes one bookmark.
 */

import css from '../ui/reader.css';
import { extractPage } from '../page/extract.js';
import { h } from '../ui/dom.js';
import { mountReader } from '../ui/reader.js';

const OPEN = '__legible__';
const FRAME =
  ':host{all:initial;position:fixed;inset:0;z-index:2147483647;display:block}' +
  '.lg-scroll{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain}';

function open() {
  const html = document.documentElement;
  const body = document.body;
  const page = extractPage(document); // read the page before anything is added to it

  const host = document.createElement('div');
  host.setAttribute('data-legible', '');
  const shadow = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(FRAME + css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.append(h('style', null, FRAME + css)); // older browsers, where no policy stands in the way
  }
  const scope = h('div', { class: 'lg lg-scroll', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Legible reading view' });
  shadow.append(scope);

  // Hold the page still and out of reach while the reader is open.
  const before = { overflow: html.style.overflow, inert: body ? body.inert : false, focus: document.activeElement };
  html.style.setProperty('overflow', 'hidden');
  if (body) body.inert = true;
  html.append(host);

  let reader = null;
  const close = () => {
    if (reader) reader.destroy();
    host.remove();
    if (before.overflow) html.style.setProperty('overflow', before.overflow);
    else html.style.removeProperty('overflow');
    if (!html.getAttribute('style')) html.removeAttribute('style'); // leave no trace on the page
    if (body) body.inert = before.inert;
    delete window[OPEN];
    if (before.focus && before.focus.focus) before.focus.focus();
  };
  window[OPEN] = close;
  scope.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  if (page.blocks.some((block) => block.type !== 'heading')) {
    reader = mountReader(scope, page, {
      scope,
      titleLevel: 1,
      brand: true,
      onClose: close,
      closeLabel: 'Back to the page',
      page: page.page,
      from: page.from,
    });
    reader.focus();
  } else {
    const back = h('button', { type: 'button', class: 'lg-main', onclick: close }, 'Back to the page');
    scope.append(
      h(
        'div',
        { style: { 'max-width': '32em', margin: '4em auto', padding: '0 1em' } },
        h('h1', null, 'Legible found no text to read here'),
        h('p', { style: { margin: '1em 0' } }, 'Select the text you want with your mouse or keyboard, then press the Legible bookmark again.'),
        back,
      ),
    );
    back.focus();
  }
}

// Pressing the bookmark a second time closes the reader.
if (window[OPEN]) window[OPEN]();
else open();
