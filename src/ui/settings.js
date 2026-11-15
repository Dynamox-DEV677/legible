/**
 * Reading settings: what they are, where they are kept, and how they reach the page.
 */

import { blend, contrastRatio, parseColor } from '../core/contrast.js';

export const THEMES = {
  light: { name: 'Light', fg: '#1a1a1a', bg: '#ffffff' },
  cream: { name: 'Cream', fg: '#2a2118', bg: '#f7f0dd' },
  dark: { name: 'Dark', fg: '#ecebe8', bg: '#131313' },
  contrast: { name: 'Maximum', fg: '#ffffff', bg: '#000000' },
};

export const FONTS = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif",
};

/**
 * WCAG 2.2 Success Criterion 1.4.12, the four values, each as a multiple of font size.
 * https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
 */
export const WCAG_SPACING = { lineHeight: 1.5, paragraph: 2, letter: 0.12, word: 0.16 };

export const DEFAULTS = {
  theme: 'light',
  fg: THEMES.light.fg,
  bg: THEMES.light.bg,
  /** Percent of the browser's own default text size. */
  size: 110,
  lineHeight: 1.6,
  paragraph: 1,
  letter: 0,
  word: 0,
  /** Characters per line. */
  measure: 66,
  font: 'sans',
  ruler: false,
  rulerLines: 3,
  rate: 1,
  voice: '',
  markRare: false,
  markLong: false,
  markPassive: false,
};

/** Each slider's range. The interface and the validation below both read this. */
export const RANGES = {
  size: { min: 100, max: 300, step: 10 },
  lineHeight: { min: 1, max: 2.5, step: 0.05 },
  paragraph: { min: 0, max: 3, step: 0.25 },
  letter: { min: 0, max: 0.3, step: 0.01 },
  word: { min: 0, max: 0.5, step: 0.02 },
  measure: { min: 40, max: 90, step: 2 },
  rulerLines: { min: 1, max: 5, step: 1 },
  rate: { min: 0.5, max: 2, step: 0.1 },
};

/** Start from the reader's system preferences, not from our taste. */
export function systemTheme() {
  const prefers = (query) => typeof matchMedia === 'function' && matchMedia(query).matches;
  if (prefers('(prefers-contrast: more)')) return 'contrast';
  if (prefers('(prefers-color-scheme: dark)')) return 'dark';
  return 'light';
}

export function loadSettings(key) {
  const settings = { ...DEFAULTS, theme: systemTheme() };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      for (const name of Object.keys(DEFAULTS)) {
        if (typeof saved[name] !== typeof DEFAULTS[name]) continue;
        const range = RANGES[name];
        settings[name] = range ? Math.min(range.max, Math.max(range.min, saved[name])) : saved[name];
      }
    }
  } catch {
    // Storage can be blocked or full. Settings then last for this visit only.
  }
  if (settings.theme !== 'custom' && !THEMES[settings.theme]) settings.theme = 'light';
  if (!FONTS[settings.font]) settings.font = 'sans';
  return settings;
}

export function saveSettings(key, settings) {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // See loadSettings.
  }
}

export const meetsWcagSpacing = (s) =>
  s.lineHeight >= WCAG_SPACING.lineHeight - 1e-9 &&
  s.paragraph >= WCAG_SPACING.paragraph - 1e-9 &&
  s.letter >= WCAG_SPACING.letter - 1e-9 &&
  s.word >= WCAG_SPACING.word - 1e-9;

export function colorsOf(settings) {
  const theme = THEMES[settings.theme];
  const fg = parseColor(theme ? theme.fg : settings.fg) || parseColor(DEFAULTS.fg);
  const bg = parseColor(theme ? theme.bg : settings.bg) || parseColor(DEFAULTS.bg);
  return { fg, bg };
}

const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (fg, bg, share) => blend([fg[0], fg[1], fg[2], share], bg);

/**
 * Every colour in the interface, derived from the two the reader chose.
 * Soft text is the text colour faded towards the background, but only as far as it can
 * go and still pass WCAG AA (4.5:1) against it.
 */
export function palette(fg, bg) {
  let share = 0.72;
  while (share < 1 && contrastRatio(mix(fg, bg, share), bg) < 4.5) share += 0.04;
  return {
    fg: hex(fg),
    bg: hex(bg),
    soft: hex(mix(fg, bg, Math.min(1, share))),
    line: hex(mix(fg, bg, 0.3)),
    tint: hex(mix(fg, bg, 0.07)),
    tint2: hex(mix(fg, bg, 0.16)),
  };
}

/** Write the settings onto an element as CSS custom properties (CSSOM, so CSP-safe). */
export function applySettings(scope, settings) {
  const { fg, bg } = colorsOf(settings);
  const colours = palette(fg, bg);
  const set = (name, value) => scope.style.setProperty(name, String(value));
  set('--lg-fg', colours.fg);
  set('--lg-bg', colours.bg);
  set('--lg-soft', colours.soft);
  set('--lg-line', colours.line);
  set('--lg-tint', colours.tint);
  set('--lg-tint2', colours.tint2);
  set('--lg-font', FONTS[settings.font]);
  set('--lg-size', settings.size / 100);
  set('--lg-lh', settings.lineHeight);
  set('--lg-ps', settings.paragraph);
  set('--lg-ls', settings.letter);
  set('--lg-ws', settings.word);
  set('color-scheme', contrastRatio(bg, [0, 0, 0]) < contrastRatio(bg, [255, 255, 255]) ? 'dark' : 'light');
  return { fg, bg, ratio: contrastRatio(fg, bg) };
}
