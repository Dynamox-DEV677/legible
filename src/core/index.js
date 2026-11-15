/**
 * Legible's analyser: everything here is plain JavaScript with no DOM, so the same code
 * runs in the app, in the bookmarklet, in the tests and on the command line.
 */

import { diagnose } from './diagnose.js';
import { measure, segmentDocument } from './measure.js';
import { parseText } from './parse.js';
import { applyFixes } from './transform.js';

export { contrastGrade, contrastRatio, formatRatio, luminance, parseColor, blend } from './contrast.js';
export { diagnose, easeLabel, gradeLabel, SCALES } from './diagnose.js';
export { lengthBands, LIMITS, measure, segmentDocument } from './measure.js';
export { looksLikeMarkdown, parseText } from './parse.js';
export { CODE_CLOSE, CODE_OPEN, splitSentences, tokenize } from './segment.js';
export { SOURCES } from './sources.js';
export { countSyllables } from './syllables.js';
export { applyFixes, chunkSizes, countWords, splitSentence } from './transform.js';
export { isCommon } from './words.js';

/**
 * Analyse a text from start to finish.
 *
 * @param {string | { blocks: import('./parse.js').Block[], title?: string }} input raw
 *   text or Markdown, or a document already split into blocks
 * @param {object} [options]
 * @param {{ split?: boolean, chunk?: boolean, keep?: Set<string> }} [options.fixes]
 * @param {object | null} [options.page] typography of the source page, if there is one
 * @param {'auto' | 'text' | 'markdown'} [options.format]
 * @returns {{
 *   original: ReturnType<typeof measure>,
 *   diagnosis: ReturnType<typeof diagnose>,
 *   view: ReturnType<typeof measure>,
 *   after: ReturnType<typeof diagnose> | null,
 * }} `original` and `diagnosis` describe the text as written. `view` is the text with
 *   the chosen fixes applied, and `after` is its diagnosis (null when nothing changed).
 */
export function analyse(input, { fixes = {}, page = null, format = 'auto' } = {}) {
  const doc = typeof input === 'string' ? parseText(input, { format }) : input;
  const base = segmentDocument(doc);
  const original = measure(base);
  const changed = Boolean(fixes.split || fixes.chunk);
  const view = changed ? measure(applyFixes(base, fixes)) : original;
  return {
    original,
    diagnosis: diagnose(original.totals, page),
    view,
    after: changed ? diagnose(view.totals, page) : null,
  };
}
