/**
 * Line focus: two veils dim everything except the line being read.
 *
 * It behaves like a ruler held against the page. With a mouse the clear band follows the
 * pointer. With a keyboard or a touch screen it stays still, a little above the middle of
 * the window, and the text moves through it as you scroll. During read-aloud it follows
 * the spoken word. In every case it snaps to a real line of text.
 */

import { h } from './dom.js';

/**
 * @param {HTMLElement} view the reader's outer element
 * @param {HTMLElement} text the article
 */
export function createRuler(view, text) {
  const top = h('div', { class: 'lg-veil lg-top', hidden: true, 'aria-hidden': 'true' });
  const bottom = h('div', { class: 'lg-veil lg-bottom', hidden: true, 'aria-hidden': 'true' });
  view.append(top, bottom);

  let on = false;
  let lines = 3;
  let pointerY = null; // null: no mouse in use, so hold the band still
  let frame = 0;

  function place() {
    frame = 0;
    if (!on) return;
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 24;
    const rect = text.getBoundingClientRect();
    const y = pointerY ?? window.innerHeight * 0.4;

    // Find a word at that height, so the band lines up with real text.
    const root = view.getRootNode();
    let word = null;
    for (const across of [0.5, 0.25, 0.75, 0.08, 0.92]) {
      const hit = root.elementFromPoint(rect.left + rect.width * across, y);
      word = hit && hit.closest ? hit.closest('.w') : null;
      if (word) break;
    }
    let lineTop = y - lineHeight / 2;
    if (word) {
      const box = word.getBoundingClientRect();
      lineTop = box.top + box.height / 2 - lineHeight / 2;
    }
    const around = ((lines - 1) / 2) * lineHeight;
    top.style.setProperty('height', `${Math.max(0, lineTop - around - 2)}px`);
    bottom.style.setProperty('top', `${Math.max(0, lineTop + lineHeight + around + 2)}px`);
  }
  const schedule = () => {
    if (on && !frame) frame = requestAnimationFrame(place);
  };
  const onPointer = (event) => {
    if (event.pointerType === 'touch') return;
    pointerY = event.clientY;
    schedule();
  };
  const onLeave = () => {
    pointerY = null;
    schedule();
  };

  const scroller = view.closest('.lg-scroll') || window;
  view.addEventListener('pointermove', onPointer);
  view.addEventListener('pointerleave', onLeave);
  scroller.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  return {
    set(enabled, lineCount) {
      on = enabled;
      lines = lineCount;
      top.hidden = bottom.hidden = !on;
      schedule();
    },
    /** Follow the word being read aloud. */
    follow(word) {
      if (!on || !word) return;
      const box = word.getBoundingClientRect();
      pointerY = box.top + box.height / 2;
      schedule();
    },
    refresh: schedule,
    destroy() {
      cancelAnimationFrame(frame);
      view.removeEventListener('pointermove', onPointer);
      view.removeEventListener('pointerleave', onLeave);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      top.remove();
      bottom.remove();
    },
  };
}
