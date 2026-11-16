/**
 * The soft thud when the seal lands. Off by default (and remembered once you switch it on).
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

/** A low, soft "thud": a short falling tone plus a muffled tap. Quiet on purpose. */
export function playThud(): void {
  if (!on) return;
  const c = primeAudio();
  if (!c) return;
  const t = c.currentTime;

  const osc = c.createOscillator();
  const body = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.17);
  body.gain.setValueAtTime(0.0001, t);
  body.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
  body.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  osc.connect(body).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.36);

  const n = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const tap = c.createBufferSource();
  const lp = c.createBiquadFilter();
  const tapGain = c.createGain();
  tap.buffer = buf;
  lp.type = "lowpass";
  lp.frequency.value = 650;
  tapGain.gain.value = 0.14;
  tap.connect(lp).connect(tapGain).connect(c.destination);
  tap.start(t);
}
