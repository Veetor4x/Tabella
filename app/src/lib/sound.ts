/**
 * The seal sound is a recording (see landing/sfx.ts: playSealPress); this file only keeps the on/off switch. Off by default (and remembered once you switch it on).
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
