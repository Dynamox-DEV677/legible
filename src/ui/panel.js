/**
 * The diagnosis panel: the grade, the one-sentence verdict, the ranked problems with a
 * fix beside each, and the working behind them.
 */

import { SCALES } from '../core/diagnose.js';
import { lengthBands, LIMITS } from '../core/measure.js';
import { SOURCES } from '../core/sources.js';
import { clear, h, sourceLink } from './dom.js';

const LEVELS = { severe: ['Severe', 3], major: ['Major', 2], minor: ['Minor', 1] };

/**
 * One or two sentences on what the fixes did, with the real before and after numbers.
 * The panel shows it and the reader announces it, so both say the same thing.
 */
export function fixSummary(original, view, ui) {
  const before = original.totals;
  const now = view.totals;
  const from = before.grade.toFixed(1);
  const to = now.grade.toFixed(1);
  const pieces = view.blocks.flatMap((b) => b.sentences).filter((s) => s.split && s.split.part === 1).length;
  const broken = new Set(view.blocks.filter((b) => b.chunk).map((b) => b.chunk.id)).size;
  const did = [];
  if (pieces) did.push(`split ${pieces} long ${pieces === 1 ? 'sentence' : 'sentences'}`);
  if (broken) did.push(`broke up ${broken} long ${broken === 1 ? 'paragraph' : 'paragraphs'}`);
  let text = did.length ? `Legible ${did.join(' and ')}. ` : '';
  text += from === to ? `The grade is unchanged at ${from}.` : `The grade fell from ${from} to ${to}.`;
  if (ui.fixes.split && now.over) {
    text += ` ${now.over} ${now.over === 1 ? 'sentence is' : 'sentences are'} still over ${LIMITS.sentence} words, because there was no safe place to split ${now.over === 1 ? 'it' : 'them'}.`;
  } else if (ui.fixes.split && before.over) {
    text += ` No sentence is over ${LIMITS.sentence} words now.`;
  }
  return text;
}
const percent = (x) => `${Math.round(x * 100)}%`;

/**
 * @param {HTMLElement} panel
 * @param {object} data
 * @param {ReturnType<import('../core/measure.js').measure>} data.original the text as written
 * @param {ReturnType<import('../core/diagnose.js').diagnose>} data.diagnosis its diagnosis
 * @param {ReturnType<import('../core/measure.js').measure>} data.view the text as shown
 * @param {ReturnType<import('../core/diagnose.js').diagnose> | null} data.after diagnosis of
 *   the text as shown, when fixes changed it
 * @param {{ fixes: object, marks: object, open: Record<string, boolean> }} ui
 * @param {Record<string, Function>} act what the buttons do
 * @param {number} level heading level for the panel's sections
 */
export function renderPanel(panel, { original, diagnosis, view, after }, ui, act, level) {
  // Redrawing replaces the buttons, so remember which one had focus and give it back.
  const root = panel.getRootNode();
  const focused = root.activeElement && panel.contains(root.activeElement) ? root.activeElement.getAttribute('data-key') : null;
  clear(panel);

  const heading = (text, cls, depth = 0) => h(`h${Math.min(6, level + depth)}`, { class: cls }, text);
  const button = (key, label, onclick, extra = {}) => h('button', { type: 'button', 'data-key': key, onclick, ...extra }, label);
  const fold = (key, summary, ...body) => {
    const details = h('details', { open: ui.open[key] || null }, h('summary', null, summary), body);
    details.addEventListener('toggle', () => {
      ui.open[key] = details.open;
    });
    return details;
  };

  panel.append(heading('Diagnosis', 'lg-sr'));
  const { verdict } = diagnosis;
  if (!verdict) {
    panel.append(h('p', null, diagnosis.notes[0].text));
    return;
  }
  const t = original.totals;
  const shown = view.totals;

  /* The verdict */
  const gradeShort = verdict.gradeNumber === 0 ? '<1' : verdict.gradeNumber === 19 ? '18+' : String(verdict.gradeNumber);
  panel.append(
    h(
      'div',
      { class: 'lg-verdict' },
      h('p', { class: 'lg-grade', 'aria-hidden': 'true' }, h('span', null, 'Grade'), h('b', null, gradeShort)),
      h(
        'div',
        null,
        h('p', { class: 'lg-headline' }, verdict.headline),
        h('p', { class: 'lg-lead' }, `${verdict.audience} ${verdict.lead}`),
        verdict.breakdown && h('p', { class: 'lg-soft' }, verdict.breakdown),
      ),
    ),
  );
  for (const note of diagnosis.notes) panel.append(h('p', { class: 'lg-note' }, note.text));

  /* Fix everything, or undo everything */
  const applied = (fix) =>
    ({ split: ui.fixes.split, chunk: ui.fixes.chunk, mark: ui.marks.rare, passive: ui.marks.passive })[fix] || false;
  // "Show passive sentences" points something out; it does not fix anything, so it is not part of "Fix all".
  const fixable = diagnosis.issues.filter((issue) => issue.fix && issue.fix !== 'passive');
  const anyOn = ui.fixes.split || ui.fixes.chunk || ui.marks.rare || ui.marks.passive || ui.marks.long;
  const actions = h('div', { class: 'lg-row lg-actions' });
  if (fixable.some((issue) => !applied(issue.fix))) {
    actions.append(button('fix-all', 'Fix all of this', act.fixAll, { class: 'lg-main lg-big' }));
  }
  if (anyOn) actions.append(button('undo-all', 'Show the text as written', act.undoAll));
  if (actions.firstChild) panel.append(actions);

  if (after) panel.append(h('p', { class: 'lg-result' }, fixSummary(original, view, ui)));

  /* The ranked problems */
  if (diagnosis.issues.length) {
    panel.append(heading('What makes it hard, worst first', 'lg-sub', 1));
    const list = h('ol', { class: 'lg-issues' });
    for (const issue of diagnosis.issues) {
      const [word, pips] = LEVELS[issue.level];
      const controls = h('div', { class: 'lg-row' });
      if (issue.fix) {
        controls.append(
          button(`fix:${issue.fix}`, issue.fixLabel, () => act.toggleFix(issue.fix), { 'aria-pressed': String(applied(issue.fix)) }),
        );
      }
      if (issue.id === 'long-sentences') {
        controls.append(button('show-long', 'Label them in the text', act.toggleLong, { 'aria-pressed': String(ui.marks.long) }));
      }
      if (issue.onPage) controls.append(h('p', { class: 'lg-soft' }, 'Already fixed in this reading view.'));
      list.append(
        h(
          'li',
          { class: 'lg-issue' },
          h(
            `h${Math.min(6, level + 2)}`,
            { class: 'lg-issue-title' },
            issue.title,
            h(
              'span',
              { class: 'lg-level' },
              h('span', { class: 'lg-pips', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h('i', { class: i < pips ? 'lg-full' : null }))),
              word,
            ),
          ),
          h('p', null, issue.finding),
          h('p', { class: 'lg-soft' }, issue.detail),
          h('p', { class: 'lg-soft' }, issue.why, issue.source && ' ', issue.source && sourceLink(SOURCES[issue.source], 'Source')),
          controls.firstChild && controls,
        ),
      );
    }
    panel.append(list);
  }
  if (diagnosis.fine.length) {
    panel.append(heading(diagnosis.issues.length ? 'What is fine' : 'What it gets right', 'lg-sub', 1));
    panel.append(h('ul', { class: 'lg-fine' }, diagnosis.fine.map((line) => h('li', null, line))));
  }

  /* The working */
  const bands = lengthBands(t.lengths);
  const widest = Math.max(1, ...bands.map((band) => band.count));
  panel.append(
    h('div', { style: { 'margin-top': '1.4em' } }),
    fold(
      'bars',
      'Words per sentence',
      h(
        'ul',
        { class: 'lg-bars' },
        bands.map((band) =>
          h(
            'li',
            { class: band.long ? 'lg-over' : null },
            h('span', null, `${band.label} words`),
            h('span', { class: 'lg-track', 'aria-hidden': 'true' }, h('span', { class: 'lg-fill', style: { width: `${(band.count / widest) * 100}%` } })),
            h('span', null, `${band.count}${band.long && band.count ? ' (long)' : ''}`),
          ),
        ),
      ),
      h('p', { class: 'lg-soft' }, `Hatched bars are sentences over ${LIMITS.sentence} words. The longest is ${t.longest}.`),
    ),
    fold(
      'numbers',
      'The numbers',
      h(
        'dl',
        { class: 'lg-stats' },
        [
          ['Flesch-Kincaid grade', t.grade.toFixed(1)],
          ['Flesch reading ease', `${Math.round(t.ease)} (${verdict.easeLabel})`],
          ['Words', t.words.toLocaleString('en')],
          ['Sentences', t.sentences.toLocaleString('en')],
          ['Words per sentence', t.wordsPerSentence.toFixed(1)],
          ['Syllables per word', t.syllablesPerWord.toFixed(2)],
          ['Time to read', `about ${Math.max(1, Math.round(t.minutes))} min`],
        ].map(([name, value]) => h('div', null, h('dt', null, name), h('dd', null, value))),
      ),
    ),
  );
  if (t.rareWords.length) {
    panel.append(
      fold(
        'words',
        `Uncommon words (${t.rareWords.length})`,
        h('p', { class: 'lg-soft' }, 'Press a word to hear it and find it in the text.'),
        h(
          'ul',
          { class: 'lg-words' },
          t.rareWords.slice(0, 120).map(({ word, count }) =>
            h('li', null, button(`word:${word}`, count > 1 ? `${word} ×${count}` : word, () => act.hearWord(word), { 'aria-label': `Hear ${word} and find it in the text` })),
          ),
        ),
      ),
    );
  }
  const scale = (name, a, b) => h('tr', null, h('th', { scope: 'row' }, name), h('td', null, a), h('td', null, b));
  panel.append(
    fold(
      'scoring',
      'How this is scored',
      h(
        'p',
        null,
        'The grade is the Flesch-Kincaid grade level: 0.39 × words per sentence + 11.8 × syllables per word − 15.59. ',
        sourceLink(SOURCES.kincaid),
        '. Reading ease is the Flesch score. ',
        sourceLink(SOURCES.flesch),
        '.',
      ),
      h(
        'p',
        null,
        'Each problem gets a severity from 0 to 1 and the worst goes first. These are the scales. They are our judgement, not a standard, and they are published so you can disagree.',
      ),
      h(
        'table',
        null,
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Check'), h('th', { scope: 'col' }, 'Starts to matter'), h('th', { scope: 'col' }, 'As bad as it gets'))),
        h(
          'tbody',
          null,
          scale(`Words in sentences over ${LIMITS.sentence} words`, percent(SCALES.longSentences.fine), percent(SCALES.longSentences.severe)),
          scale('Uncommon words', percent(SCALES.rareWords.fine), percent(SCALES.rareWords.severe)),
          scale('Words of three or more syllables', percent(SCALES.longWords.fine), percent(SCALES.longWords.severe)),
          scale(`Words in paragraphs over ${LIMITS.paragraph} words`, percent(SCALES.longParagraphs.fine), percent(SCALES.longParagraphs.severe)),
          scale('Sentences that look passive', percent(SCALES.passive.fine), percent(SCALES.passive.severe)),
        ),
      ),
      h(
        'p',
        { class: 'lg-soft' },
        'Syllables are counted from spelling. The rules agree with the CMU Pronouncing Dictionary on 98.6% of the 12,000 most common words, and a table covers the rest. Uncommon means outside the 5,000 word forms heard most in film and television. ',
        sourceLink(SOURCES.subtitles, 'Why subtitles'),
        '. The 25-word line for sentences is from ',
        sourceLink(SOURCES.govuk, 'GOV.UK'),
        '.',
      ),
    ),
  );

  if (focused) {
    const again = [...panel.querySelectorAll('[data-key]')].find((el) => el.getAttribute('data-key') === focused);
    (again || panel.querySelector('[data-key]'))?.focus();
  }
}
