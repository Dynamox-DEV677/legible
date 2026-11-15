/**
 * Colour contrast, exactly as WCAG 2.2 defines it.
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *
 * Legible shows these numbers for its own themes and for the pages it reads, so the
 * arithmetic lives here in the open and is tested against known values.
 */

/**
 * Parse a CSS colour as a browser reports it in computed styles.
 * Understands #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() in both the comma and the space
 * syntax, and color(srgb …).
 * @returns {[number, number, number, number] | null} red, green, blue (0-255) and alpha (0-1)
 */
export function parseColor(value) {
  const s = String(value).trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const number = (part, scale) => (part.endsWith('%') ? (parseFloat(part) / 100) * scale : parseFloat(part));
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
    return [number(parts[0], 255), number(parts[1], 255), number(parts[2], 255), alpha];
  }
  m = /^color\(srgb\s+([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
    return [number(parts[0], 1) * 255, number(parts[1], 1) * 255, number(parts[2], 1) * 255, alpha];
  }
  return null;
}

/** Lay a see-through colour over a solid one. */
export function blend([r, g, b, a], [br, bg, bb]) {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

/**
 * Relative luminance: 0 for black, 1 for white.
 * "L = 0.2126 * R + 0.7152 * G + 0.0722 * B", where each channel is first made linear:
 * "if RsRGB <= 0.04045 then R = RsRGB/12.92 else R = ((RsRGB+0.055)/1.055) ^ 2.4".
 */
export function luminance([r, g, b]) {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Contrast ratio, from 1 (no contrast) to 21 (black on white):
 * "(L1 + 0.05) / (L2 + 0.05)", L1 being the lighter colour. Not rounded, as WCAG asks.
 * @param {[number, number, number, number?]} a
 * @param {[number, number, number, number?]} b
 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG's verdict for body text at a given ratio. */
export function contrastGrade(ratio) {
  if (ratio >= 7) return { passes: true, level: 'AAA', text: 'passes AA (4.5:1) and AAA (7:1)' };
  if (ratio >= 4.5) return { passes: true, level: 'AA', text: 'passes AA (4.5:1), below AAA (7:1)' };
  return { passes: false, level: '', text: 'fails AA (needs 4.5:1)' };
}

/** "12.6" for display. Truncated, never rounded up past a threshold: 4.49 must not show as 4.5. */
export const formatRatio = (ratio) => (Math.floor(ratio * 10) / 10).toFixed(1);
