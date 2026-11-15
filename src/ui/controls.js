/**
 * Reading settings. Every control says why it exists and links to its source, and the
 * two claims that can be measured (line length and contrast) are measured live.
 */

import { contrastGrade, formatRatio, luminance } from '../core/contrast.js';
import { SOURCES } from '../core/sources.js';
import { clear, h, sourceLink } from './dom.js';
import { DEFAULTS, meetsWcagSpacing, RANGES, THEMES, WCAG_SPACING } from './settings.js';

let serial = 0;

/**
 * @param {HTMLElement} panel
 * @param {typeof DEFAULTS} settings changed in place
 * @param {{ rare: boolean, long: boolean, passive: boolean }} marks changed in place
 * @param {object} act
 * @param {(what: string) => void} act.changed a setting changed; `what` names its group
 * @param {(text: string) => void} act.announce
 * @param {number} level heading level for the panel
 * @returns {{ refresh: () => void, measured: (info: object) => void }}
 */
export function renderControls(panel, settings, marks, act, level) {
  clear(panel);
  const id = () => `lg-c${++serial}`;
  /** @type {Record<string, { input: HTMLInputElement, show: () => void }>} */
  const sliders = {};
  const refreshers = [];
  const cite = (...children) => h('p', { class: 'lg-cite' }, children);
  const group = (legend, ...children) => h('fieldset', null, h('legend', null, legend), children);

  function slider(name, label, format, say, what) {
    const range = RANGES[name];
    const inputId = id();
    const output = h('output', { for: inputId });
    const input = h('input', { type: 'range', id: inputId, min: range.min, max: range.max, step: range.step });
    const show = () => {
      input.value = String(settings[name]);
      output.textContent = format(settings[name]);
      input.setAttribute('aria-valuetext', say(settings[name]));
    };
    input.addEventListener('input', () => {
      settings[name] = Number(input.value);
      show();
      act.changed(what);
    });
    sliders[name] = { input, show };
    show();
    return h('div', { class: 'lg-field' }, h('div', { class: 'lg-field-head' }, h('label', { for: inputId }, label), output), input);
  }
  function check(label, get, set) {
    const input = h('input', { type: 'checkbox' });
    const show = () => {
      input.checked = get();
    };
    input.addEventListener('change', () => set(input.checked));
    refreshers.push(show);
    show();
    return h('label', { class: 'lg-check' }, input, h('span', null, label));
  }
  function choice(label, pressed, onclick, extra = {}) {
    const button = h('button', { type: 'button', onclick, ...extra }, label);
    refreshers.push(() => button.setAttribute('aria-pressed', String(pressed())));
    return button;
  }

  const times = (digits) => (v) => `${v.toFixed(digits)}×`;
  const timesSize = (v) => `${v} times the text size`;

  /* ---- Spacing ---- */
  const spacingMeter = h('p', { class: 'lg-meter' });
  const usesPreset = (preset) => Object.keys(WCAG_SPACING).every((key) => Math.abs(settings[key] - preset[key]) < 1e-9);
  const applySpacing = (preset, message) => () => {
    Object.assign(settings, preset);
    act.changed('spacing');
    refresh();
    act.announce(message);
  };
  const defaultSpacing = { lineHeight: DEFAULTS.lineHeight, paragraph: DEFAULTS.paragraph, letter: DEFAULTS.letter, word: DEFAULTS.word };
  const spacing = group(
    'Spacing',
    h(
      'div',
      { class: 'lg-row' },
      choice('WCAG AA spacing', () => usesPreset(WCAG_SPACING), applySpacing(WCAG_SPACING, 'WCAG AA spacing applied: line height 1.5, paragraph spacing 2, letter spacing 0.12, word spacing 0.16.')),
      choice('Legible default', () => usesPreset(defaultSpacing), applySpacing(defaultSpacing, 'Default spacing applied.')),
    ),
    slider('lineHeight', 'Line height', times(2), timesSize, 'spacing'),
    slider('paragraph', 'Space after paragraphs', times(2), timesSize, 'spacing'),
    slider('letter', 'Letter spacing', times(2), timesSize, 'spacing'),
    slider('word', 'Word spacing', times(2), timesSize, 'spacing'),
    spacingMeter,
    cite(
      h('b', null, 'WCAG 2.2 SC 1.4.12 Text Spacing (AA). '),
      'Every web page has to keep working when a reader sets line height to 1.5, paragraph spacing to 2, letter spacing to 0.12 and word spacing to 0.16 times the text size. Those four numbers are what a page must allow, not a rule for how all text should be set. One tap applies them. ',
      sourceLink(SOURCES.spacing, 'Read the criterion'),
      '.',
    ),
    cite(
      h('b', null, 'Why letter spacing. '),
      'Zorzi and colleagues (2012) found that wider letter spacing improved reading, with no training, in Italian and French children with dyslexia. Whether it helps you is for you to judge, which is why it is a slider. ',
      sourceLink(SOURCES.zorzi, 'Read the study'),
      '.',
    ),
  );

  /* ---- Size and width ---- */
  const measureMeter = h('p', { class: 'lg-meter' });
  let basePx = 16;
  const size = group(
    'Size and width',
    slider('size', 'Text size', (v) => `${v}% · ${Math.round((v / 100) * basePx * 10) / 10}px`, (v) => `${v} percent`, 'size'),
    cite(
      h('b', null, 'WCAG 2.2 SC 1.4.4 Resize Text (AA). '),
      'Text must be able to grow to 200% without losing content. This view goes to 300%, and lines re-wrap so you never scroll sideways. ',
      sourceLink(SOURCES.resize, 'Read the criterion'),
      '.',
    ),
    slider('measure', 'Line length', (v) => `${v} characters`, (v) => `${v} characters per line`, 'size'),
    measureMeter,
    cite(
      h('b', null, 'WCAG 2.2 SC 1.4.8 Visual Presentation (AAA). '),
      'Asks for lines of 80 characters or fewer. Typographers aim for 45 to 75 and call 66 ideal. That range is a long-standing convention, not an experiment. ',
      sourceLink(SOURCES.presentation, 'Read the criterion'),
      ' · ',
      sourceLink(SOURCES.measure, 'Bringhurst on line length'),
      '.',
    ),
  );

  /* ---- Colours ---- */
  const contrastMeter = h('p', { class: 'lg-meter' });
  const working = h('p', { class: 'lg-soft' });
  const textColour = h('input', { type: 'color', id: id() });
  const backColour = h('input', { type: 'color', id: id() });
  const pick = () => {
    Object.assign(settings, { theme: 'custom', fg: textColour.value, bg: backColour.value });
    act.changed('colour');
    refresh();
  };
  textColour.addEventListener('input', pick);
  backColour.addEventListener('input', pick);
  const colours = group(
    'Colours',
    h(
      'div',
      { class: 'lg-swatches' },
      Object.entries(THEMES).map(([key, theme]) =>
        choice(
          [h('i', { 'aria-hidden': 'true', style: { background: theme.bg, color: theme.fg } }, 'A'), theme.name],
          () => settings.theme === key,
          () => {
            settings.theme = key;
            act.changed('colour');
            refresh();
            act.announce(`${theme.name} theme.`);
          },
        ),
      ),
    ),
    h(
      'div',
      { class: 'lg-row', style: { 'margin-top': '0.6em' } },
      h('label', { for: textColour.id }, 'Your own text colour'),
      textColour,
      h('label', { for: backColour.id }, 'and background'),
      backColour,
    ),
    contrastMeter,
    h('details', null, h('summary', null, 'How that number is worked out'), working),
    cite(
      h('b', null, 'WCAG 2.2 SC 1.4.3 Contrast (AA) '),
      'asks for at least 4.5:1 for body text, and SC 1.4.6 (AAA) for 7:1. The ratio above is calculated from the two colours on your screen right now, not taken on trust. ',
      sourceLink(SOURCES.contrast, 'Read the criterion'),
      '.',
    ),
  );

  /* ---- Typeface ---- */
  const setFont = (font, name) => () => {
    settings.font = font;
    act.changed('size');
    refresh();
    act.announce(`${name} typeface.`);
  };
  const typeface = group(
    'Typeface',
    h(
      'div',
      { class: 'lg-row' },
      choice('Sans serif', () => settings.font === 'sans', setFont('sans', 'Sans serif')),
      choice('Serif', () => settings.font === 'serif', setFont('serif', 'Serif')),
    ),
    cite(
      h('b', null, 'No “dyslexia font” here, on purpose. '),
      'A 2026 meta-analysis of 15 studies found that fonts such as OpenDyslexic and Dyslexie have no reliable effect on reading speed or accuracy. Where one seemed to help, it was the wider spacing doing the work, not the letter shapes. So Legible gives you spacing. ',
      sourceLink(SOURCES.azzarello),
      ' · ',
      sourceLink(SOURCES.marinus),
      ' · ',
      sourceLink(SOURCES.wery),
      ' · ',
      sourceLink(SOURCES.kuster),
      '.',
    ),
  );

  /* ---- Line focus ---- */
  const focus = group(
    'Line focus',
    check(
      'Dim everything except the line I am reading',
      () => settings.ruler,
      (value) => {
        settings.ruler = value;
        act.changed('ruler');
        act.announce(value ? 'Line focus on.' : 'Line focus off.');
      },
    ),
    slider('rulerLines', 'Lines kept clear', (v) => String(v), (v) => `${v} ${v === 1 ? 'line' : 'lines'}`, 'ruler'),
    cite('A reading ruler helps some readers keep their place. We know of no strong study either way, so this one is simply here for you to try.'),
  );

  /* ---- Marks ---- */
  const mark = (key, label) =>
    check(label, () => marks[key], (value) => {
      marks[key] = value;
      act.changed('marks');
    });
  const marking = group(
    'Marks in the text',
    mark('rare', 'Underline uncommon words (dotted)'),
    mark('long', 'Label sentences over 25 words'),
    mark('passive', 'Underline passive voice (wavy, an estimate)'),
  );

  panel.append(
    h(`h${level}`, { class: 'lg-sr' }, 'Reading settings'),
    h('p', { class: 'lg-soft' }, 'Each setting says why it is here. Your choices stay in this browser.'),
    spacing,
    size,
    colours,
    typeface,
    focus,
    marking,
    h(
      'div',
      { class: 'lg-row', style: { 'margin-top': '1.2em' } },
      h('button', {
        type: 'button',
        onclick: () => {
          const { rate, voice } = settings;
          Object.assign(settings, DEFAULTS, { rate, voice });
          act.changed('all');
          refresh();
          act.announce('Every reading setting is back to its default.');
        },
      }, 'Reset reading settings'),
    ),
  );

  let last = null;
  function refresh() {
    for (const { show } of Object.values(sliders)) show();
    for (const show of refreshers) show();
    if (last) measured(last);
  }

  /**
   * Show what was measured on screen.
   * @param {{ fg: number[], bg: number[], ratio: number, perLine: number, basePx: number }} info
   */
  function measured(info) {
    last = info;
    basePx = info.basePx;
    sliders.size.show();

    const missing = [
      settings.lineHeight < WCAG_SPACING.lineHeight && 'line height',
      settings.paragraph < WCAG_SPACING.paragraph && 'paragraph spacing',
      settings.letter < WCAG_SPACING.letter && 'letter spacing',
      settings.word < WCAG_SPACING.word && 'word spacing',
    ].filter(Boolean);
    spacingMeter.textContent = meetsWcagSpacing(settings)
      ? 'These settings meet or exceed all four SC 1.4.12 values.'
      : `Below the SC 1.4.12 values for ${missing.join(', ')}.`;

    measureMeter.textContent = '';
    measureMeter.append('Measured on your screen: about ', h('b', null, String(info.perLine)), ` characters per line${info.perLine < settings.measure ? ', because the window is narrower than the setting' : ''}.`);

    const grade = contrastGrade(info.ratio);
    contrastMeter.textContent = '';
    contrastMeter.append('Contrast ', h('b', null, `${formatRatio(info.ratio)}:1`), `. ${grade.text[0].toUpperCase()}${grade.text.slice(1)}.`, grade.passes ? '' : ' Pick two colours further apart.');
    const lf = luminance(info.fg);
    const lb = luminance(info.bg);
    const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
    working.textContent =
      `Luminance of the text colour is ${lf.toFixed(4)} and of the background ${lb.toFixed(4)}, on a scale from 0 (black) to 1 (white). ` +
      `Contrast = (lighter + 0.05) ÷ (darker + 0.05) = (${hi.toFixed(4)} + 0.05) ÷ (${lo.toFixed(4)} + 0.05) = ${info.ratio.toFixed(2)}. ` +
      'Luminance is 0.2126 × red + 0.7152 × green + 0.0722 × blue, after each channel is made linear.';

    const toHex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    textColour.value = toHex(info.fg);
    backColour.value = toHex(info.bg);
  }

  refresh();
  return { refresh, measured };
}
