/**
 * A tiny DOM builder.
 *
 * Legible runs as a bookmarklet inside other people's pages, some of which forbid
 * innerHTML (Trusted Types) and inline style attributes (Content Security Policy). So the
 * whole interface is built from createElement, textContent and the CSSOM, which every
 * policy allows.
 */

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props] `class`, `text`, `on<event>` handlers and a
 *   `style` object are special. Everything else becomes an attribute; `true` sets an empty
 *   attribute, and `false`, `null` and `undefined` set nothing.
 * @param {...(Node | string | null | undefined | false | (Node | string)[])} children
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v);
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) add(el, child);
    else el.append(child);
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  back: 'M6 6h2v12H6zm3.5 6L18 6v12z',
  next: 'M16 6h2v12h-2zM6 6l8.5 6L6 18z',
  close: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z',
  sliders: 'M4 6h9v2H4zm13 0h3v2h-3zM4 16h3v2H4zm7 0h9v2h-9zm2-12h2v6h-2zM7 14h2v6H7z',
  sound: 'M4 9v6h4l5 4V5L8 9zm11.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5z',
};

/** A decorative icon. The button it sits in always carries the words. */
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'lg-i');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/** A link to a source, opening in a new tab and saying so. */
export function sourceLink(source, text = source.label) {
  if (!source.url) return document.createTextNode(text);
  return h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, text, h('span', { class: 'lg-sr' }, ' (opens in a new tab)'));
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
