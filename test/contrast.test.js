import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blend, contrastGrade, contrastRatio, formatRatio, luminance, parseColor } from '../src/core/contrast.js';

const ratio = (a, b) => contrastRatio(parseColor(a), parseColor(b));

test('contrast: the fixed points of the WCAG formula', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  assert.ok(Math.abs(luminance([255, 255, 255]) - 1) < 1e-12);
  assert.ok(Math.abs(ratio('#000', '#fff') - 21) < 1e-9);
  assert.equal(ratio('#abcdef', '#abcdef'), 1);
  assert.equal(ratio('#123456', '#fedcba'), ratio('#fedcba', '#123456'), 'order does not matter');
});

test('contrast: the well-known boundary greys on white', () => {
  // #767676 is the lightest grey that passes AA on white; #777777 just fails.
  assert.ok(ratio('#767676', '#ffffff') >= 4.5);
  assert.ok(ratio('#777777', '#ffffff') < 4.5);
  assert.equal(formatRatio(ratio('#767676', '#ffffff')), '4.5');
  assert.equal(formatRatio(ratio('#777777', '#ffffff')), '4.4', 'a failing ratio is never rounded up to a pass');
  // #595959 is the lightest grey that passes AAA on white.
  assert.ok(ratio('#595959', '#ffffff') >= 7);
  assert.ok(ratio('#5a5a5a', '#ffffff') < 7);
});

test('contrast: grades', () => {
  assert.equal(contrastGrade(21).level, 'AAA');
  assert.equal(contrastGrade(7).level, 'AAA');
  assert.equal(contrastGrade(6.99).level, 'AA');
  assert.equal(contrastGrade(4.5).passes, true);
  assert.equal(contrastGrade(4.49).passes, false);
});

test('contrast: colours are read in every form a browser reports them', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('#1a2B3c'), [26, 43, 60, 1]);
  assert.deepEqual(parseColor('rgb(26, 43, 60)'), [26, 43, 60, 1]);
  assert.deepEqual(parseColor('rgba(26, 43, 60, 0.5)'), [26, 43, 60, 0.5]);
  assert.deepEqual(parseColor('rgb(26 43 60 / 50%)'), [26, 43, 60, 0.5]);
  assert.deepEqual(parseColor('color(srgb 1 0 0)'), [255, 0, 0, 1]);
  assert.deepEqual(parseColor('transparent'), [0, 0, 0, 0]);
  assert.equal(parseColor('not a colour'), null);
});

test('contrast: see-through text is blended onto its background first', () => {
  const grey = blend(parseColor('rgba(0, 0, 0, 0.5)'), parseColor('#ffffff'));
  assert.deepEqual(grey.slice(0, 3).map(Math.round), [128, 128, 128]);
});
