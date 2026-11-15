/**
 * The diagnosis: turn a pile of numbers into one sentence that says what to fix first.
 *
 * Every check is put on the same 0-to-1 severity scale and the worst one leads. The
 * scales below are judgement calls. They are published here, and shown in the interface,
 * so that anyone can argue with them.
 */

import { LIMITS } from './measure.js';

/**
 * For each check: the value where it starts to matter (`fine`) and the value where it
 * is as bad as it gets (`severe`). `weight` lowers the ceiling for checks that matter
 * less to a reader than sentence length and vocabulary do.
 */
export const SCALES = {
  /** Share of all words that sit inside sentences longer than 25 words. */
  longSentences: { fine: 0.1, severe: 0.6 },
  /** Share of words that are not everyday words. */
  rareWords: { fine: 0.06, severe: 0.2 },
  /** Share of words with three or more syllables. */
  longWords: { fine: 0.12, severe: 0.25 },
  /** Share of all words that sit inside paragraphs longer than 150 words. */
  longParagraphs: { fine: 0.1, severe: 0.8, weight: 0.8 },
  /** Share of sentences that look passive. */
  passive: { fine: 0.2, severe: 0.6, weight: 0.5 },
  /** Characters per line on the page being read. WCAG 1.4.8 asks for 80 at most. */
  lineLength: { fine: 80, severe: 140 },
  /** Body text size in CSS pixels. Browsers default to 16. */
  textSize: { fine: 16, severe: 11 },
  /** Contrast ratio of body text. WCAG 1.4.3 asks for 4.5 at least. */
  contrast: { fine: 4.5, severe: 2 },
  /** Line height as a multiple of text size. WCAG 1.4.8 asks for 1.5 at least. */
  lineSpacing: { fine: 1.5, severe: 1.1, weight: 0.6 },
};

const severityOf = (value, { fine, severe, weight = 1 }) =>
  Math.max(0, Math.min(1, (value - fine) / (severe - fine))) * weight;

const plural = (count, word) => `${count.toLocaleString('en')} ${word}${count === 1 ? '' : 's'}`;
const be = (count) => (count === 1 ? 'is' : 'are');
const percent = (share) => {
  const p = share * 100;
  return p > 0 && p < 1 ? 'under 1%' : `${Math.round(p)}%`;
};
const one = (x) => x.toFixed(1);

/** Flesch's own words for each band of his Reading Ease scale. */
export function easeLabel(ease) {
  if (ease >= 90) return 'very easy';
  if (ease >= 80) return 'easy';
  if (ease >= 70) return 'fairly easy';
  if (ease >= 60) return 'plain English';
  if (ease >= 50) return 'fairly difficult';
  if (ease >= 30) return 'difficult';
  if (ease >= 10) return 'very difficult';
  return 'extremely difficult';
}

/** A US school grade as a whole number, with the wording for either end of the scale. */
export function gradeLabel(grade) {
  const g = Math.round(grade);
  if (g < 1) return { number: 0, text: 'below Grade 1', phrase: 'This reads below a Grade 1 level.' };
  if (g > 18) return { number: 19, text: 'above Grade 18', phrase: 'This reads above a Grade 18 level.' };
  return { number: g, text: `Grade ${g}`, phrase: `This reads at a Grade ${g} level.` };
}

function audience(g) {
  if (g <= 5) return 'Very easy to read.';
  if (g <= 6) return 'Easy to read.';
  if (g <= 7) return 'Fairly easy to read.';
  if (g <= 9) return 'Plain English.';
  if (g <= 12) return 'Fairly difficult to read.';
  if (g <= 16) return 'Difficult to read: college level.';
  return 'Very difficult to read: graduate level.';
}

const levelOf = (severity) => (severity >= 0.66 ? 'severe' : severity >= 0.33 ? 'major' : 'minor');

/**
 * @param {ReturnType<import('./measure.js').measure>['totals']} t
 * @param {{ lineLength?: number, fontSize?: number, contrast?: number, lineHeight?: number } | null} [page]
 *   how the source web page set its text, when Legible was opened on a page
 */
export function diagnose(t, page = null) {
  if (!t.sentences) {
    return { verdict: null, issues: [], fine: [], notes: [{ id: 'empty', text: 'There is no text to measure yet.' }] };
  }
  const notes = [];
  if (t.words < 100) {
    notes.push({
      id: 'short',
      text: `This is a short sample (${plural(t.words, 'word')}). Readability scores are steadier on 100 words or more.`,
    });
  }
  if (t.lexical >= 30 && t.everydayShare < 0.5) {
    notes.push({
      id: 'language',
      text: 'This does not look like English. Legible only understands English, so treat these numbers with care.',
    });
  }

  const issues = [];
  const fine = [];

  /* Sentences */
  {
    const share = t.wordsInLong / t.words;
    const severity = severityOf(share, SCALES.longSentences);
    if (severity > 0) {
      const count = `${t.over} of ${plural(t.sentences, 'sentence')} ${be(t.over)} over ${LIMITS.sentence} words`;
      issues.push({
        id: 'long-sentences',
        severity,
        title: 'Long sentences',
        finding: t.wayOver ? `${count}, and ${t.wayOver} of those ${be(t.wayOver)} over ${LIMITS.verySentence}.` : `${count}.`,
        detail: `The longest is ${t.longest} words. Sentences average ${one(t.wordsPerSentence)} words, and the long ones hold ${percent(share)} of the text.`,
        lead: `The hardest thing about it is sentence length: ${t.over} of its ${plural(t.sentences, 'sentence')} ${be(t.over)} over ${LIMITS.sentence} words.`,
        why: 'GOV.UK asks its writers to break up sentences longer than 25 words.',
        source: 'govuk',
        fix: 'split',
        fixLabel: 'Split long sentences',
      });
    } else {
      fine.push(
        `Sentences are short: ${one(t.wordsPerSentence)} words on average` +
          (t.over ? `, with ${t.over} over ${LIMITS.sentence}.` : `, and none over ${LIMITS.sentence}.`),
      );
    }
  }

  /* Vocabulary */
  {
    const rare = severityOf(t.rareShare, SCALES.rareWords);
    const long = severityOf(t.polysyllableShare, SCALES.longWords);
    const severity = Math.max(rare, long);
    const examples = t.rareWords.slice(0, 5).map((entry) => entry.word);
    if (severity > 0) {
      const uncommon = `${plural(t.rare, 'word')} (${percent(t.rareShare)}) ${be(t.rare)} outside the 5,000 most common in spoken English`;
      issues.push({
        id: 'hard-words',
        severity,
        title: 'Uncommon words',
        finding: `${uncommon}.`,
        detail:
          `${percent(t.polysyllableShare)} of words have three or more syllables, and words average ${t.syllablesPerWord.toFixed(2)} syllables.` +
          (examples.length ? ` Used most: ${examples.join(', ')}.` : ''),
        lead: `The hardest thing about it is the vocabulary: ${uncommon}.`,
        why: 'Words that are rare in speech take readers longer to recognise.',
        source: 'subtitles',
        fix: 'mark',
        fixLabel: 'Underline uncommon words',
      });
    } else {
      fine.push(`The words are everyday ones: ${percent(t.rareShare)} are uncommon.`);
    }
  }

  /* Paragraphs */
  {
    const share = t.wordsInLongParagraphs / t.words;
    const severity = severityOf(share, SCALES.longParagraphs);
    if (severity > 0) {
      const count = `${t.longParagraphs} of ${plural(t.paragraphs, 'paragraph')} ${be(t.longParagraphs)} over ${LIMITS.paragraph} words`;
      issues.push({
        id: 'long-paragraphs',
        severity,
        title: 'Long paragraphs',
        finding: `${count}. The longest is ${t.longestParagraph} words.`,
        detail: `They hold ${percent(share)} of the text.`,
        lead: `The hardest thing about it is paragraph length: ${count}.`,
        why: 'A wall of text gives the eye nowhere to rest. The 150-word line is our own rule of thumb, not a standard.',
        source: null,
        fix: 'chunk',
        fixLabel: 'Break up long paragraphs',
      });
    } else {
      fine.push(`Paragraphs are short: the longest is ${plural(t.longestParagraph, 'word')}.`);
    }
  }

  /* Passive voice */
  {
    const share = t.passiveSentences / t.sentences;
    const severity = severityOf(share, SCALES.passive);
    const count = `about ${t.passiveSentences} of ${plural(t.sentences, 'sentence')}`;
    if (severity > 0) {
      issues.push({
        id: 'passive',
        severity,
        title: 'Passive voice (estimate)',
        finding: `${count[0].toUpperCase()}${count.slice(1)} look passive: they say what was done, but may not say who did it.`,
        detail: 'This is a pattern match, not a grammar check, so expect a few misses either way.',
        lead: `The hardest thing about it is the passive voice: ${count} do not plainly say who is acting.`,
        why: 'Readers follow a sentence more easily when it names who is doing what.',
        source: null,
        fix: 'passive',
        fixLabel: 'Show passive sentences',
      });
    } else {
      fine.push(t.passiveSentences ? `Little passive voice: ${count}.` : 'No passive voice found.');
    }
  }

  /* The page itself, when there is one */
  if (page) {
    const pageIssue = (id, value, scale, issue, okText) => {
      if (value === undefined || value === null || Number.isNaN(value)) return;
      const severity = severityOf(value, scale);
      if (severity > 0) issues.push({ id, severity, fix: null, onPage: true, ...issue });
      else fine.push(okText);
    };
    pageIssue(
      'line-length',
      page.lineLength,
      SCALES.lineLength,
      {
        title: 'Wide lines on this page',
        finding: `Lines on this page run to about ${Math.round(page.lineLength)} characters. WCAG asks for 80 at most.`,
        detail: 'Typographers aim for 45 to 75. This reading view caps the line for you.',
        lead: `The page is the problem more than the words: its lines run to about ${Math.round(page.lineLength)} characters, and WCAG asks for 80 at most.`,
        why: 'On a long line the eye struggles to find the start of the next one.',
        source: 'presentation',
      },
      `Lines on this page are about ${Math.round(page.lineLength)} characters wide.`,
    );
    pageIssue(
      'small-text',
      page.fontSize,
      SCALES.textSize,
      {
        title: 'Small text on this page',
        finding: `Body text on this page is ${one(page.fontSize)}px. Browsers start at 16px.`,
        detail: 'This reading view starts at your browser’s own default size and scales up from there.',
        lead: `The page is the problem more than the words: its body text is only ${one(page.fontSize)}px.`,
        why: 'WCAG sets no minimum size, but it does require that text can be enlarged to 200%.',
        source: 'resize',
      },
      `Body text on this page is ${one(page.fontSize)}px.`,
    );
    pageIssue(
      'low-contrast',
      page.contrast,
      SCALES.contrast,
      {
        title: 'Low contrast on this page',
        finding: `Text on this page has a contrast ratio of ${one(Math.floor(page.contrast * 10) / 10)}:1. WCAG AA asks for at least 4.5:1.`,
        detail: 'Every theme in this reading view shows its own measured ratio.',
        lead: `The page is the problem more than the words: its text contrast is ${one(Math.floor(page.contrast * 10) / 10)}:1, and WCAG AA asks for 4.5:1.`,
        why: 'Low contrast makes letters harder to tell apart, most of all for readers with low vision.',
        source: 'contrast',
      },
      `Text contrast on this page is ${one(Math.floor(page.contrast * 10) / 10)}:1.`,
    );
    pageIssue(
      'tight-lines',
      page.lineHeight,
      SCALES.lineSpacing,
      {
        title: 'Tight line spacing on this page',
        finding: `Lines on this page are set ${page.lineHeight.toFixed(2)} times the text size apart. WCAG asks for 1.5.`,
        detail: 'This reading view spaces lines at 1.5 or more.',
        lead: `The page is the problem more than the words: its lines are set only ${page.lineHeight.toFixed(2)} times the text size apart.`,
        why: 'Lines set close together are easy to lose your place in.',
        source: 'presentation',
      },
      `Line spacing on this page is ${page.lineHeight.toFixed(2)} times the text size.`,
    );
  }

  issues.sort((a, b) => b.severity - a.severity);
  for (const issue of issues) issue.level = levelOf(issue.severity);

  const grade = gradeLabel(t.grade);
  const fromSentences = Math.max(0, t.gradeFromSentences);
  const fromWords = Math.max(0, t.gradeFromWords);
  let breakdown = '';
  if (fromSentences >= 0.5 || fromWords >= 0.5) {
    const parts = [];
    if (fromSentences >= 0.5) parts.push(`long sentences add about ${one(fromSentences)} grade levels`);
    if (fromWords >= 0.5) parts.push(`long words add about ${one(fromWords)}`);
    breakdown = `Against plain writing (${LIMITS.plainSentence}-word sentences, ${LIMITS.plainSyllables} syllables a word), ${parts.join(' and ')}.`;
  }

  return {
    verdict: {
      grade: t.grade,
      gradeNumber: grade.number,
      gradeText: grade.text,
      headline: grade.phrase,
      audience: audience(grade.number),
      ease: t.ease,
      easeLabel: easeLabel(t.ease),
      lead: issues.length ? issues[0].lead : 'Nothing stands out. Sentences are short and the words are everyday ones.',
      breakdown,
    },
    issues,
    fine,
    notes,
  };
}
