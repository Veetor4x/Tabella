/**
 * One soft low tone when the seal settles. Off by default (and remembered once you switch it on).
 * Made with the browser's audio engine, so there is no sound file to load.
 */
const KEY = "tabella.sound.v1";

let on = false;
try {
  on = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on";
} catch {
  on = false; // blocked storage: stay off
}

let ctx: AudioContext | undefined;
const listeners = new Set<() => void>();

export const isSoundOn = () => on;
export const subscribeSound = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** Create (or wake) the audio engine. Browsers only allow this after a tap, so it is called from taps. */
export function primeAudio(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return undefined;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setSound(value: boolean): void {
  on = value;
  try {
    window.localStorage.setItem(KEY, value ? "on" : "off");
  } catch {
    /* fine: it just will not be remembered */
  }
  if (value) primeAudio();
  listeners.forEach((f) => f());
}

/**
 * One soft, low tone when the seal settles: a slow rise, a long fade, nothing sharp.
 * (A sine near F3 with a very quiet octave above it, through a low-pass filter.)
 */
export function playSealTone(): void {
  if (!on) return;
  const c = primeAudio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;
  lp.connect(c.destination);
  for (const [freq, peak] of [[174.6, 0.16], [349.2, 0.025]] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    osc.connect(g).connect(lp);
    osc.start(t);
    osc.stop(t + 3.5);
  }
}
