/**
 * The reader: diagnosis, text, reading settings and read-aloud, mounted into any element.
 * The app uses it on its own page. The bookmarklet mounts the very same component in a
 * shadow root on top of someone else's page.
 */

import { diagnose } from '../core/diagnose.js';
import { measure, segmentDocument } from '../core/measure.js';
import { applyFixes } from '../core/transform.js';
import { renderArticle } from './article.js';
import { renderControls } from './controls.js';
import { clear, h, icon, prefersReducedMotion } from './dom.js';
import { fixSummary, renderPanel } from './panel.js';
import { createRuler } from './ruler.js';
import { applySettings, loadSettings, saveSettings } from './settings.js';
import { createSpeaker } from './speech.js';

const SYNC_TEXT = {
  unknown: 'Press any word to read from there.',
  exact: 'Word highlight is exact: this voice reports each word as it says it.',
  estimated: 'Word highlight is estimated: this voice does not report its position, so Legible times it.',
};

/**
 * @param {HTMLElement} container where to put the reader
 * @param {{ blocks: object[], title?: string, lang?: string }} doc a document already split
 *   into blocks, from parseText() or extractPage()
 * @param {object} [options]
 * @param {HTMLElement} [options.scope] the element that carries the theme (a `.lg` element)
 * @param {number} [options.titleLevel] heading level of the reader's title: 1 when the
 *   reader is the whole page, 2 when it sits under a page heading
 * @param {() => void} [options.onClose]
 * @param {string} [options.closeLabel]
 * @param {boolean} [options.brand] show the Legible name in the reader's bar
 * @param {object | null} [options.page] typography measured on the source page
 * @param {string} [options.from] one line saying where the text came from
 * @param {string} [options.storageKey]
 * @returns {{ destroy: () => void, focus: () => void }}
 */
export function mountReader(container, doc, options = {}) {
  const {
    scope = container.closest('.lg') || container,
    titleLevel = 2,
    onClose = null,
    closeLabel = 'Close',
    brand = false,
    page = null,
    from = '',
    storageKey = 'legible:settings',
  } = options;
  const sectionLevel = Math.min(6, titleLevel + 1);

  const base = segmentDocument(doc);
  const original = measure(base);
  const diagnosis = diagnose(original.totals, page);

  const settings = loadSettings(storageKey);
  const ui = {
    fixes: { split: false, chunk: false, keep: new Set() },
    marks: { rare: false, long: false, passive: false },
    open: {},
  };
  let view = original;
  let after = null;
  let drawn = null;
  let lit = [-1, -1];
  let pop = null;
  let colours = null;

  /* ---------------- Elements ---------------- */
  const live = h('div', { class: 'lg-sr', role: 'status', 'aria-live': 'polite' });
  const title = doc.title || 'Your text';
  const titleEl = h(`h${titleLevel}`, { class: 'lg-title', tabindex: '-1' }, title);
  const uid = `lg-${Math.random().toString(36).slice(2, 8)}`;
  const bar = h(
    'header',
    { class: 'lg-bar' },
    brand && h('span', { class: 'lg-brand' }, 'Legible'),
    titleEl,
    onClose && h('button', { type: 'button', onclick: () => onClose() }, icon('close'), h('span', null, closeLabel)),
  );

  // Diagnosis and settings share one column, as two tabs. The diagnosis comes first in
  // the page and on the screen, because Legible diagnoses before it treats.
  const panel = h('section', { class: 'lg-dx', id: `${uid}-dx`, role: 'tabpanel', 'aria-labelledby': `${uid}-tab-dx` });
  const side = h('section', { class: 'lg-set', id: `${uid}-set`, role: 'tabpanel', 'aria-labelledby': `${uid}-tab-set`, hidden: true });
  const tabs = [
    { key: 'dx', label: 'Diagnosis', body: panel },
    { key: 'set', label: 'Reading settings', body: side },
  ];
  const selectTab = (key, focus = false) => {
    for (const tab of tabs) {
      const selected = tab.key === key;
      tab.button.setAttribute('aria-selected', String(selected));
      tab.button.setAttribute('tabindex', selected ? '0' : '-1');
      tab.body.hidden = !selected;
      if (selected && focus) tab.button.focus();
    }
  };
  tabs.forEach((tab, i) => {
    tab.button = h('button', { type: 'button', role: 'tab', id: `${uid}-tab-${tab.key}`, 'aria-controls': tab.body.id }, tab.label);
    tab.button.addEventListener('click', () => selectTab(tab.key));
    // Arrow keys move between tabs, as the ARIA tabs pattern asks.
    tab.button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      selectTab(tabs[(i + 1) % tabs.length].key, true);
    });
  });
  const tablist = h('div', { class: 'lg-tabs', role: 'tablist', 'aria-label': 'Diagnosis and reading settings' }, tabs.map((tab) => tab.button));
  const toText = h('button', { type: 'button', class: 'lg-quiet lg-jump' }, 'Skip to the text');
  const sidebar = h('div', { class: 'lg-side' }, tablist, toText, panel, side);

  const notice = h('div', { class: 'lg-notice', hidden: true });
  const article = h('article', { class: 'lg-text', lang: doc.lang || 'en', tabindex: '-1', 'aria-label': 'Text' });
  const column = h('div', { class: 'lg-col' }, from && h('p', { class: 'lg-soft lg-from' }, from), notice, article);
  const wrap = h('div', { class: 'lg-wrap' }, sidebar, column);
  selectTab('dx');
  toText.addEventListener('click', () => {
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });

  /* Read-aloud bar */
  const playButton = h('button', { type: 'button', class: 'lg-main' });
  const backButton = h('button', { type: 'button', 'aria-label': 'Previous sentence' }, icon('back'));
  const nextButton = h('button', { type: 'button', 'aria-label': 'Next sentence' }, icon('next'));
  const rateId = `${uid}-rate`;
  const rateOut = h('output', { for: rateId });
  const rateInput = h('input', { type: 'range', id: rateId, min: '0.5', max: '2', step: '0.1' });
  const voiceId = `${uid}-voice`;
  const voiceSelect = h('select', { id: voiceId });
  const status = h('p', { class: 'lg-status' });
  // On a phone the bar shows the three buttons and folds speed and voice away, so it
  // never covers a quarter of the screen.
  const more = h('div', { class: 'lg-more', id: `${uid}-more` }, h('label', { for: rateId }, 'Speed', rateInput, rateOut), h('label', { for: voiceId }, 'Voice', voiceSelect), status);
  const moreButton = h('button', { type: 'button', class: 'lg-more-toggle', 'aria-expanded': 'false', 'aria-controls': more.id }, icon('sliders'), h('span', null, 'Voice and speed'));
  moreButton.addEventListener('click', () => {
    const open = more.classList.toggle('lg-show');
    moreButton.setAttribute('aria-expanded', String(open));
  });
  const player = h('div', { class: 'lg-player', role: 'group', 'aria-label': 'Read aloud' }, playButton, backButton, nextButton, moreButton, more);

  const root = h('div', { class: 'lg-view' }, bar, wrap, player, live);
  container.append(root);

  const announce = (text) => {
    live.textContent = '';
    setTimeout(() => {
      live.textContent = text;
    }, 60);
  };
  const reveal = (el) => el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

  /* ---------------- Read-aloud ---------------- */
  const speaker = createSpeaker({
    lang: doc.lang || 'en',
    onWord(s, w) {
      const [ps, pw] = lit;
      if (drawn && ps >= 0) {
        drawn.sentenceEls[ps]?.classList.remove('lg-now');
        drawn.wordEls[ps]?.[pw]?.classList.remove('lg-on');
      }
      lit = [s, w];
      if (!drawn || s < 0) return;
      drawn.sentenceEls[s]?.classList.add('lg-now');
      const word = drawn.wordEls[s]?.[w];
      if (!word) return;
      word.classList.add('lg-on');
      // Keep the spoken word clear of the two bars, and scroll only when it drifts out.
      const box = word.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.18 || box.bottom > window.innerHeight * 0.72) reveal(word);
      ruler.follow(word);
    },
    onState(state, problem) {
      clear(playButton);
      playButton.append(icon(state === 'playing' ? 'pause' : 'play'), h('span', null, state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Read aloud'));
      if (problem) status.textContent = `Read-aloud stopped: ${problem}. Try another voice.`;
    },
    onSync(sync) {
      status.textContent = SYNC_TEXT[sync];
    },
    onVoices: () => fillVoices(),
  });

  function fillVoices() {
    const voices = speaker.voices();
    clear(voiceSelect);
    voiceSelect.append(h('option', { value: '' }, 'Browser default'));
    for (const voice of voices) {
      voiceSelect.append(h('option', { value: voice.voiceURI }, `${voice.name}${voice.localService ? '' : ' (online)'}`));
    }
    const chosen = voices.find((voice) => voice.voiceURI === settings.voice);
    voiceSelect.value = chosen ? chosen.voiceURI : '';
    speaker.setVoice(chosen || null);
  }
  const showRate = () => {
    rateInput.value = String(settings.rate);
    rateOut.textContent = `${settings.rate.toFixed(1)}×`;
    rateInput.setAttribute('aria-valuetext', `${settings.rate.toFixed(1)} times normal speed`);
  };

  if (speaker.supported) {
    playButton.addEventListener('click', () => (speaker.state === 'playing' ? speaker.pause() : speaker.play()));
    backButton.addEventListener('click', () => speaker.step(-1));
    nextButton.addEventListener('click', () => speaker.step(1));
    rateInput.addEventListener('input', () => {
      settings.rate = Number(rateInput.value);
      showRate();
      speaker.setRate(settings.rate);
      saveSettings(storageKey, settings);
    });
    voiceSelect.addEventListener('change', () => {
      settings.voice = voiceSelect.value;
      saveSettings(storageKey, settings);
      speaker.setVoice(speaker.voices().find((voice) => voice.voiceURI === settings.voice) || null);
    });
    speaker.setRate(settings.rate);
    showRate();
    fillVoices();
    status.textContent = SYNC_TEXT.unknown;
  } else {
    for (const control of [playButton, backButton, nextButton, rateInput, voiceSelect]) control.disabled = true;
    status.textContent = 'Read-aloud is not available in this browser.';
  }
  clear(playButton).append(icon('play'), h('span', null, 'Read aloud'));

  /* ---------------- Line focus ---------------- */
  const ruler = createRuler(root, article);

  /* ---------------- Drawing ---------------- */
  function closePop() {
    if (!pop) return;
    pop.remove();
    pop = null;
  }

  function drawMarks() {
    article.classList.toggle('lg-marks-rare', ui.marks.rare);
    article.classList.toggle('lg-marks-long', ui.marks.long);
    article.classList.toggle('lg-marks-passive', ui.marks.passive);
  }

  function drawNotice() {
    clear(notice);
    const pieces = view.blocks.flatMap((b) => b.sentences).filter((s) => s.split && s.split.part === 1).length;
    const broken = new Set(view.blocks.filter((b) => b.chunk).map((b) => b.chunk.id)).size;
    notice.hidden = !(pieces || broken);
    if (notice.hidden) return;
    const parts = [];
    if (pieces) parts.push(`split ${pieces} long ${pieces === 1 ? 'sentence' : 'sentences'}`);
    if (broken) parts.push(`broke up ${broken} long ${broken === 1 ? 'paragraph' : 'paragraphs'}`);
    notice.append(
      h(
        'p',
        null,
        h('b', null, 'This is not the text as written. '),
        `Legible ${parts.join(' and ')}. The words and their order are the same; only punctuation, capitals and paragraph breaks changed. A split sentence may still read a little differently from the original, so check anything that matters.`,
      ),
      h('button', { type: 'button', 'data-key': 'notice-undo', onclick: act.undoAll }, 'Show the text as written'),
    );
  }

  function drawPanel() {
    renderPanel(panel, { original, diagnosis, view, after }, ui, act, sectionLevel);
  }

  /** Redraw the text after a fix changed it. Reading aloud stops, because the text moved. */
  function redraw() {
    closePop();
    speaker.stop();
    const changed = ui.fixes.split || ui.fixes.chunk;
    view = changed ? measure(applyFixes(base, ui.fixes)) : original;
    after = changed ? diagnose(view.totals, page) : null;
    drawn = renderArticle(article, view, { headingOffset: titleLevel });
    speaker.load(drawn.spoken);
    drawMarks();
    drawNotice();
    drawPanel();
    measureLine();
    ruler.refresh();
  }

  /**
   * Line length, measured. A `ch` unit is the width of a zero, which is wider than the
   * average letter, so "66ch" holds nearer 75 characters. Legible instead measures the
   * real width of this text in this font at this spacing, and sizes the column from that.
   */
  function measureLine() {
    const sample = (article.textContent || '').replace(/\s+/g, ' ').slice(0, 400);
    const basePx = parseFloat(getComputedStyle(scope).fontSize) || 16;
    let perLine = settings.measure;
    if (sample.length >= 40) {
      const probe = h('span', { 'aria-hidden': 'true', style: { position: 'absolute', visibility: 'hidden', 'white-space': 'nowrap' } }, sample);
      article.append(probe);
      const perChar = probe.getBoundingClientRect().width / sample.length;
      probe.remove();
      if (perChar > 0) {
        scope.style.setProperty('--lg-col', `${Math.ceil(perChar * settings.measure)}px`);
        perLine = Math.min(settings.measure, Math.floor(article.getBoundingClientRect().width / perChar));
      }
    }
    controls.measured({ ...colours, perLine, basePx });
  }

  /* ---------------- Actions ---------------- */
  const act = {
    fixAll() {
      for (const issue of diagnosis.issues) {
        if (issue.fix === 'split' || issue.fix === 'chunk') ui.fixes[issue.fix] = true;
        if (issue.fix === 'mark') ui.marks.rare = true;
      }
      ui.fixes.keep.clear();
      redraw();
      controls.refresh();
      announce(after ? fixSummary(original, view, ui) : 'Uncommon words underlined.');
    },
    undoAll() {
      Object.assign(ui.fixes, { split: false, chunk: false });
      ui.fixes.keep.clear();
      Object.assign(ui.marks, { rare: false, long: false, passive: false });
      redraw();
      controls.refresh();
      announce('Showing the text as written.');
    },
    toggleFix(fix) {
      if (fix === 'split' || fix === 'chunk') {
        ui.fixes[fix] = !ui.fixes[fix];
        if (fix === 'split') ui.fixes.keep.clear();
        redraw();
        announce(ui.fixes[fix] && after ? fixSummary(original, view, ui) : fix === 'split' ? 'Sentences shown as written.' : 'Paragraphs shown as written.');
        return;
      }
      const key = fix === 'mark' ? 'rare' : 'passive';
      ui.marks[key] = !ui.marks[key];
      drawMarks();
      drawPanel();
      controls.refresh();
      announce(`${key === 'rare' ? 'Uncommon words' : 'Passive voice'} ${ui.marks[key] ? 'underlined' : 'no longer underlined'}.`);
      if (ui.marks[key]) {
        const first = article.querySelector(key === 'rare' ? '.lg-rare' : '.lg-pv');
        if (first) reveal(first);
      }
    },
    toggleLong() {
      ui.marks.long = !ui.marks.long;
      drawMarks();
      drawPanel();
      controls.refresh();
      announce(ui.marks.long ? 'Long sentences labelled with their word counts.' : 'Labels removed.');
      if (ui.marks.long) {
        const first = article.querySelector('.lg-long');
        if (first) reveal(first);
      }
    },
    hearWord(word) {
      speaker.say(word);
      if (!ui.marks.rare) {
        ui.marks.rare = true;
        drawMarks();
        drawPanel();
        controls.refresh();
      }
      const first = [...article.querySelectorAll('.lg-rare')].find((el) => el.textContent.toLowerCase() === word);
      if (first) reveal(first);
    },
  };

  /* ---------------- Reading settings ---------------- */
  const controls = renderControls(
    side,
    settings,
    ui.marks,
    {
      announce,
      changed(what) {
        if (what === 'marks') {
          drawMarks();
          drawPanel();
          return;
        }
        colours = applySettings(scope, settings);
        saveSettings(storageKey, settings);
        ruler.set(settings.ruler, settings.rulerLines);
        measureLine();
      },
    },
    sectionLevel,
  );

  /* ---------------- Words: press one to read from it, or to learn about it ---------------- */
  function openPop(wordEl) {
    closePop();
    const word = wordEl.textContent;
    const place = drawn.where.get(wordEl);
    pop = h(
      'div',
      { class: 'lg-pop', role: 'dialog', 'aria-label': `About the word ${word}` },
      h('p', null, h('b', null, word)),
      h('p', null, 'Not one of the 5,000 word forms heard most often in spoken English, so many readers will have met it rarely.'),
      h(
        'div',
        { class: 'lg-row' },
        h('button', { type: 'button', onclick: () => speaker.say(word) }, icon('sound'), h('span', null, 'Hear it')),
        h('button', {
          type: 'button',
          onclick: () => {
            closePop();
            speaker.playFrom(place[0], place[1]);
          },
        }, 'Read from here'),
        h('button', {
          type: 'button',
          onclick: () => {
            closePop();
            article.focus();
          },
        }, 'Close'),
      ),
    );
    column.append(pop);
    const box = wordEl.getBoundingClientRect();
    const frame = column.getBoundingClientRect();
    const left = Math.max(0, Math.min(box.left - frame.left, frame.width - pop.offsetWidth));
    pop.style.setProperty('left', `${left}px`);
    pop.style.setProperty('top', `${box.bottom - frame.top + 8}px`);
    pop.querySelector('button').focus();
  }

  article.addEventListener('click', (event) => {
    const cut = event.target.closest('.lg-cut');
    if (cut) {
      const id = cut.getAttribute('data-cut');
      if (ui.fixes.keep.has(id)) ui.fixes.keep.delete(id);
      else ui.fixes.keep.add(id);
      redraw();
      article.querySelector(`[data-key="cut:${id}"]`)?.focus();
      announce(ui.fixes.keep.has(id) ? 'Sentence shown as written.' : 'Sentence split.');
      return;
    }
    const word = event.target.closest('.w');
    if (!word || !drawn.where.has(word)) return;
    // Dragging to select text ends in a click too. That is not a request to read aloud.
    const selection = root.getRootNode().getSelection ? root.getRootNode().getSelection() : window.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (ui.marks.rare && word.classList.contains('lg-rare')) {
      openPop(word);
      return;
    }
    if (!speaker.supported) return;
    const [s, w] = drawn.where.get(word);
    speaker.playFrom(s, w);
  });
  const onPointerDown = (event) => {
    if (pop && !event.composedPath().includes(pop)) closePop();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && pop) {
      event.stopPropagation();
      closePop();
      article.focus();
    }
  };
  const onResize = () => {
    closePop();
    measureLine();
  };
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  /* ---------------- Go ---------------- */
  colours = applySettings(scope, settings);
  ruler.set(settings.ruler, settings.rulerLines);
  redraw();
  if (diagnosis.verdict) announce(`${diagnosis.verdict.headline} ${diagnosis.verdict.lead}`);
  // Web fonts and late layout can change the width of a character.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => root.isConnected && measureLine());

  return {
    focus: () => titleEl.focus(),
    destroy() {
      speaker.destroy();
      ruler.destroy();
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
}
