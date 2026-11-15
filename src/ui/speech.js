/**
 * Read-aloud with the spoken word highlighted.
 *
 * The Web Speech API tells us which word it has reached through a `boundary` event, but
 * not in every browser and not for every voice. So this module does not assume. It starts
 * out estimating where the voice is from a timer, and listens. If boundary events arrive
 * it switches to them and reports "exact". If a whole chunk goes by without one, it stays
 * on the timer and reports "estimated". The timer teaches itself the voice's real speed
 * from how long each chunk took, so the estimate tightens as reading goes on.
 *
 * Other things it works around, all of them real:
 *  - Some browsers cut off a long utterance, so text is spoken in chunks of a sentence or
 *    less. That also makes "start from this word" and a change of speed take effect at once.
 *  - pause() and resume() are unreliable on Android, so pausing cancels the speech and
 *    remembers the word, and resuming starts again from that word.
 *  - cancel() followed straight away by speak() can drop the new utterance, so a restart
 *    waits a moment.
 *  - A cancelled utterance still fires its events later, so each one carries a ticket and
 *    stale tickets are ignored.
 */

const now = () => performance.now();

/** A chunk longer than this many characters is cut at the last comma that fits. */
const CHUNK = 240;

/**
 * @typedef {{ text: string, words: { start: number, end: number }[] }} Spoken one
 *   sentence: the text to say, and where each word sits in it
 *
 * @param {object} hooks
 * @param {(sentence: number, word: number) => void} hooks.onWord the word being spoken,
 *   or (-1, -1) when nothing is
 * @param {(state: 'idle' | 'playing' | 'paused', problem?: string) => void} hooks.onState
 * @param {(sync: 'unknown' | 'exact' | 'estimated') => void} hooks.onSync
 * @param {() => void} [hooks.onVoices] the list of voices arrived or changed
 * @param {string} [hooks.lang]
 */
export function createSpeaker({ onWord, onState, onSync, onVoices = () => {}, lang = 'en' }) {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  /** @type {Spoken[]} */
  let sentences = [];
  let at = { s: 0, w: 0 };
  let state = 'idle';
  let ticket = 0;
  let rate = 1;
  let voice = null;
  let sync = 'unknown';
  let secondsPerChar = 0.068; // a typical voice at normal speed, until we have measured this one
  // A timer, not requestAnimationFrame: speech carries on in a background tab, and frames do not.
  let timer = 0;
  let cancelledAt = -1e9;
  let current = null; // held so the browser cannot garbage-collect an utterance mid-speech

  const setState = (next, problem) => {
    state = next;
    onState(state, problem);
  };
  const setSync = (next) => {
    if (sync === next) return;
    sync = next;
    onSync(sync);
  };

  function halt() {
    ticket++;
    clearTimeout(timer);
    if (synth && (synth.speaking || synth.pending)) {
      synth.cancel();
      cancelledAt = now();
    }
  }

  /** Where to end the chunk that starts at word `from`: the sentence end, or the last comma that fits. */
  function chunkEnd(sentence, from) {
    const { words, text } = sentence;
    const base = words[from].start;
    if (text.length - base <= CHUNK) return words.length;
    let fits = from + 1;
    let comma = 0;
    for (let i = from + 1; i < words.length && words[i].start - base <= CHUNK; i++) {
      fits = i;
      if (/[,;:—–]/.test(text.slice(words[i - 1].end, words[i].start))) comma = i;
    }
    return comma || fits;
  }

  /** The word a character position belongs to. Boundary events can land on the space before it. */
  function wordAt(words, position, from, to) {
    let found = from;
    for (let i = from; i < to && words[i].start <= position; i++) found = i;
    return found;
  }

  function speak() {
    while (at.s < sentences.length && !sentences[at.s].words.length) at = { s: at.s + 1, w: 0 };
    if (at.s >= sentences.length) {
      at = { s: 0, w: 0 };
      onWord(-1, -1);
      setState('idle');
      return;
    }
    const sentence = sentences[at.s];
    const { words } = sentence;
    const s = at.s;
    const from = Math.min(at.w, words.length - 1);
    const to = chunkEnd(sentence, from);
    const base = words[from].start;
    const text = sentence.text.slice(base, to < words.length ? words[to].start : sentence.text.length);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.lang = voice ? voice.lang : lang;
    if (voice) utterance.voice = voice;
    const mine = ++ticket;
    let heardBoundary = false;
    let startedAt = 0;

    const show = (w) => {
      at = { s, w };
      onWord(s, w);
    };
    const estimate = () => {
      const t0 = now();
      const tick = () => {
        if (mine !== ticket) return;
        const spoken = (((now() - t0) / 1000) * rate) / secondsPerChar; // characters said so far, we think
        let w = from;
        while (w + 1 < to && words[w + 1].start - base <= spoken) w++;
        if (w !== at.w) show(w);
        timer = setTimeout(tick, 40);
      };
      tick();
    };

    utterance.onstart = () => {
      if (mine !== ticket) return;
      startedAt = now();
      show(from);
      if (sync !== 'exact') estimate();
    };
    utterance.onboundary = (event) => {
      if (mine !== ticket || (event.name && event.name !== 'word')) return;
      if (!heardBoundary) {
        heardBoundary = true;
        clearTimeout(timer); // real positions from here on
        setSync('exact');
      }
      show(wordAt(words, base + event.charIndex, from, to));
    };
    utterance.onend = () => {
      if (mine !== ticket) return;
      clearTimeout(timer);
      if (startedAt && text.length > 30) {
        const measured = (((now() - startedAt) / 1000) * rate) / text.length;
        secondsPerChar = Math.min(0.2, Math.max(0.03, secondsPerChar * 0.4 + measured * 0.6));
      }
      if (!heardBoundary && to - from >= 3 && sync === 'unknown') setSync('estimated');
      at = to < words.length ? { s, w: to } : { s: s + 1, w: 0 };
      speak();
    };
    utterance.onerror = (event) => {
      if (mine !== ticket || event.error === 'canceled' || event.error === 'interrupted') return;
      clearTimeout(timer);
      onWord(-1, -1); // nothing is being spoken, so nothing should stay lit
      setState('idle', event.error || 'failed');
    };

    current = utterance;
    show(from); // light the word at once; the voice can take a moment to start
    const wait = now() - cancelledAt < 150 ? 150 : 0;
    setTimeout(() => {
      if (mine === ticket) synth.speak(utterance);
    }, wait);
  }

  const start = () => {
    if (!synth) return;
    halt();
    setState('playing');
    speak();
  };

  if (synth) {
    // The voice list often arrives after the page has loaded.
    if (synth.addEventListener) synth.addEventListener('voiceschanged', onVoices);
    else setTimeout(onVoices, 600);
  }

  return {
    supported: Boolean(synth),
    get state() {
      return state;
    },
    get sync() {
      return sync;
    },
    get position() {
      return at;
    },
    /** @param {Spoken[]} list */
    load(list) {
      halt();
      sentences = list;
      at = { s: 0, w: 0 };
      if (state !== 'idle') setState('idle');
    },
    play: start,
    /** Start from a given word: the answer to "click any word to read from there". */
    playFrom(s, w = 0) {
      at = { s, w };
      start();
    },
    pause() {
      if (state !== 'playing') return;
      halt();
      setState('paused');
    },
    stop() {
      halt();
      at = { s: 0, w: 0 };
      onWord(-1, -1);
      setState('idle');
    },
    /** Move by whole sentences. While playing, reading carries on from the new place. */
    step(by) {
      const s = Math.min(Math.max(0, at.s + by), Math.max(0, sentences.length - 1));
      at = { s, w: 0 };
      if (state === 'playing') start();
      else onWord(s, 0);
    },
    setRate(value) {
      rate = value;
      if (state === 'playing') start(); // from the current word, at the new speed
    },
    setVoice(next) {
      voice = next || null;
      sync = 'unknown'; // a different voice may or may not report word positions
      onSync(sync);
      if (state === 'playing') start();
    },
    /** Say one word on its own, for the "hear this word" button. */
    say(text) {
      if (!synth) return;
      const wasPlaying = state === 'playing';
      halt();
      if (wasPlaying) setState('paused');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.min(rate, 0.9);
      utterance.lang = voice ? voice.lang : lang;
      if (voice) utterance.voice = voice;
      current = utterance;
      const mine = ++ticket;
      setTimeout(() => {
        if (mine === ticket) synth.speak(utterance);
      }, now() - cancelledAt < 150 ? 150 : 0);
    },
    /** Voices for this language, with ones that work offline first. */
    voices() {
      if (!synth) return [];
      const prefix = lang.slice(0, 2).toLowerCase();
      return synth
        .getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith(prefix))
        .sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default) || a.name.localeCompare(b.name));
    },
    destroy() {
      halt();
      if (synth && synth.removeEventListener) synth.removeEventListener('voiceschanged', onVoices);
      current = null;
    },
  };
}
