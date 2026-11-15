/**
 * The app page: take a text in (pasted, opened from a file, or handed over by the
 * bookmarklet), open the reader on it, and set up the bookmarklet and offline use.
 */

import { parseText } from '../core/parse.js';
import { SOURCES } from '../core/sources.js';
import { extractPage } from '../page/extract.js';
import { h, sourceLink } from '../ui/dom.js';
import { mountReader } from '../ui/reader.js';
import { applySettings, loadSettings } from '../ui/settings.js';
import { SAMPLES } from './samples.js';
import { SOURCE_NOTES } from './source-notes.js';

const SETTINGS_KEY = 'legible:settings';
const $ = (id) => document.getElementById(id);

// Theme the page with the reader's saved choices before anything else is drawn.
applySettings(document.body, loadSettings(SETTINGS_KEY));

const start = $('start');
const host = $('reader');
const form = $('form');
const textarea = $('text');
const error = $('form-error');
const sample = $('sample');
const query = new URLSearchParams(location.search);
let reader = null;

/* ------------------------------------------------------------------------------------
 * Opening and closing the reader
 * ---------------------------------------------------------------------------------- */

function openReader(input, { from = '', page = null, push = true } = {}) {
  if (reader) reader.destroy();
  start.hidden = true;
  host.hidden = false;
  document.body.classList.add('app-reading');
  reader = mountReader(host, input, {
    scope: document.body,
    titleLevel: 1,
    brand: true,
    closeLabel: 'New text',
    // Opened from the form: go Back to it. Opened by a direct link: there is nothing to go back to.
    onClose: () => (push ? history.back() : closeReader()),
    from,
    page,
    storageKey: SETTINGS_KEY,
  });
  window.scrollTo(0, 0);
  reader.focus();
  // The browser's Back button should return to the form, as people expect.
  if (push) history.pushState({ reading: true }, '');
}

function closeReader() {
  if (!reader) return;
  reader.destroy();
  reader = null;
  host.hidden = true;
  start.hidden = false;
  document.body.classList.remove('app-reading');
  window.scrollTo(0, 0);
  textarea.focus();
}
window.addEventListener('popstate', closeReader);

function fail(message) {
  error.textContent = message;
  error.hidden = false;
  textarea.setAttribute('aria-invalid', 'true');
  textarea.focus();
}
function clearError() {
  error.hidden = true;
  textarea.removeAttribute('aria-invalid');
}

/* ------------------------------------------------------------------------------------
 * Getting a text in
 * ---------------------------------------------------------------------------------- */

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!textarea.value.trim()) {
    fail('There is no text to check yet. Paste some into the box, open a file, or pick a sample.');
    return;
  }
  clearError();
  openReader(parseText(textarea.value));
});
textarea.addEventListener('input', clearError);
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) form.requestSubmit();
});

async function openFile(file) {
  if (!file) return;
  if (file.size > 5_000_000) {
    fail(`“${file.name}” is ${(file.size / 1e6).toFixed(1)} MB. Legible reads text files up to 5 MB.`);
    return;
  }
  const text = await file.text();
  clearError();
  if (/\.html?$/i.test(file.name) || file.type === 'text/html') {
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    const page = extractPage(parsed, { live: false });
    if (!page.blocks.length) {
      fail(`Legible could not find any text in “${file.name}”.`);
      return;
    }
    openReader(page, { from: `From the file ${file.name}.` });
    return;
  }
  const format = /\.(?:md|markdown)$/i.test(file.name) ? 'markdown' : 'auto';
  openReader(parseText(text, { format }), { from: `From the file ${file.name}.` });
}
$('file').addEventListener('change', (event) => {
  openFile(event.target.files[0]);
  event.target.value = '';
});
textarea.addEventListener('dragover', (event) => {
  if (![...event.dataTransfer.types].includes('Files')) return;
  event.preventDefault();
  textarea.classList.add('app-drop');
});
textarea.addEventListener('dragleave', () => textarea.classList.remove('app-drop'));
textarea.addEventListener('drop', (event) => {
  textarea.classList.remove('app-drop');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  event.preventDefault();
  openFile(file);
});

/* Samples */
for (const { id, label, note } of SAMPLES) sample.append(h('option', { value: id }, `${label} (${note})`));
sample.append(h('option', { value: 'readme' }, 'This project’s own README'));

async function openSample(id, push = true) {
  if (id === 'readme') {
    try {
      const response = await fetch('dist/readme.md');
      if (!response.ok) throw new Error(String(response.status));
      openReader(parseText(await response.text(), { format: 'markdown' }), { from: 'Legible’s own README, judged by Legible.', push });
    } catch {
      fail('The README could not be loaded. Are you offline for the first time?');
    }
    return;
  }
  const found = SAMPLES.find((s) => s.id === id);
  if (!found) return;
  textarea.value = found.text;
  clearError();
  openReader(parseText(found.text), { from: `Sample: ${found.label.toLowerCase()}, ${found.note}.`, push });
}
sample.addEventListener('change', () => {
  const id = sample.value;
  sample.value = '';
  openSample(id);
});

/* ------------------------------------------------------------------------------------
 * The bookmarklet
 * ---------------------------------------------------------------------------------- */

const mark = $('mark');
const markSmall = $('mark-small');
const markState = $('mark-state');
const origin = location.origin;

/**
 * The small bookmarklet: loads the reader from this site. If the page it is pressed on
 * forbids outside scripts, it opens Legible in a new tab and hands the text over with
 * postMessage, which goes straight from one tab to the other and not through any server.
 */
const SMALL =
  `javascript:(function(){var d=document,w=window,o=${JSON.stringify(origin)};if(w.__legible__){w.__legible__();return}` +
  `var s=d.createElement('script');s.src=o+'/dist/legible.page.js';s.onerror=function(){` +
  `var t=String(w.getSelection()||'')||(d.querySelector('article,main,[role=main]')||d.body).innerText,p=w.open(o+'/%23from-page');` +
  `if(!p)return;w.addEventListener('message',function f(e){if(e.origin===o&&e.data==='legible-ready'){` +
  `p.postMessage({legible:1,title:d.title,text:t,from:location.hostname},o);w.removeEventListener('message',f)}})};` +
  `d.documentElement.appendChild(s)})()`;
markSmall.href = SMALL;

let bookmarklet = '';
fetch('dist/bookmarklet.txt')
  .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
  .then((text) => {
    bookmarklet = text.trim();
    mark.href = bookmarklet;
    markState.textContent = `${Math.round(bookmarklet.length / 1024)} KB, all of Legible in one bookmark.`;
  })
  .catch(() => {
    mark.href = SMALL;
    markState.textContent = 'The large bookmarklet could not be loaded, so this is the small version.';
  });

/** Pressing the button here, instead of dragging it, runs Legible on this very page. */
function tryHere(event) {
  event.preventDefault();
  if (window.__legible__) {
    window.__legible__();
    return;
  }
  const script = document.createElement('script');
  script.src = 'dist/legible.page.js';
  script.onerror = () => {
    markState.textContent = 'Drag the button to your bookmarks bar to use it.';
  };
  document.head.append(script);
}
mark.addEventListener('click', tryHere);
markSmall.addEventListener('click', tryHere);

$('mark-copy').addEventListener('click', async () => {
  const code = bookmarklet || SMALL;
  try {
    await navigator.clipboard.writeText(code);
    markState.textContent = 'Copied. Make a new bookmark and paste this as its address.';
  } catch {
    markState.textContent = 'Copying was blocked by the browser. Drag the button instead.';
  }
});

/** The other half of the small bookmarklet's hand-over. */
if (location.hash === '#from-page' && window.opener) {
  history.replaceState(null, '', location.pathname);
  const timer = setTimeout(() => fail('The page did not send its text. Copy the text and paste it here instead.'), 4000);
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.opener || !data || data.legible !== 1 || typeof data.text !== 'string') return;
    clearTimeout(timer);
    const page = parseText(data.text, { format: 'text' });
    const title = String(data.title || '').slice(0, 200);
    if (title && !page.title) page.blocks.unshift({ type: 'heading', level: 1, text: title });
    page.title = page.title || title;
    openReader(page, { from: data.from ? `From ${String(data.from).slice(0, 100)}.` : '' });
  });
  window.opener.postMessage('legible-ready', '*');
}

/* ------------------------------------------------------------------------------------
 * Sources, offline, deep links
 * ---------------------------------------------------------------------------------- */

const list = $('source-list');
for (const [key, source] of Object.entries(SOURCES)) {
  const note = SOURCE_NOTES[key];
  list.append(
    h(
      'li',
      null,
      h('strong', null, sourceLink(source)),
      h('span', null, `${note.title}. ${note.where}.`),
      h('span', { class: 'lg-soft' }, note.says),
    ),
  );
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || query.has('sw'))) {
  navigator.serviceWorker
    .register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      $('offline').textContent = 'Saved on this device: it now works offline.';
    })
    .catch(() => {});
}

// ?sample=terms opens a sample straight away. Handy for sharing and for screenshots.
if (query.has('sample')) openSample(query.get('sample'), false);
