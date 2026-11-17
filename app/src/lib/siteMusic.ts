/**
 * The quiet music for the main site: a calm instrumental that loops with a smooth crossfade.
 * Browsers block autoplay, so it starts softly after the visitor's first tap or key press (a scroll counts only where
 * the browser already allows sound). The little wave icon pauses and resumes it, and the choice is remembered.
 * The intro film holds it while the film plays (the film has its own, different track).
 */
import { primeAudio, setSound } from "./sound";

const files = import.meta.glob<string>("../assets/music/site.mp3", { eager: true, query: "?url", import: "default" });
const url = Object.values(files)[0];

const KEY = "tabella.music.v1";
export const SITE_LEVEL = 0.17; // "around 15 to 20 percent"
const FADE_IN = 3.2; // seconds
const FADE_OUT = 0.9;
const CROSS = 5; // seconds of overlap between the end of one pass and the start of the next

let wanted = true; // the visitor's choice (off once they pause it)
try {
  wanted = typeof window === "undefined" || window.localStorage.getItem(KEY) !== "off";
} catch {
  wanted = true;
}
let unlocked = false; // a first gesture has happened
let holds = 0; // the intro film (and anything else) asking for quiet
let hiddenTab = false;
let playing = false;

let ctx: AudioContext | undefined;
let out: GainNode | undefined;
let buffer: AudioBuffer | undefined;
let loading: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let sources: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
let generation = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const siteMusicAvailable = () => Boolean(url);
export const siteMusicPlaying = () => playing && wanted;
export const siteMusicWanted = () => wanted;
export const subscribeSiteMusic = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

async function load(): Promise<void> {
  if (buffer || !url || !ctx) return;
  loading ??= (async () => {
    const data = await (await fetch(url)).arrayBuffer();
    buffer = await ctx!.decodeAudioData(data);
  })().catch(() => {
    loading = undefined;
  });
  await loading;
}

/** Start one pass at ctx time `when`, fading in over CROSS, and fading out CROSS before it ends; then line up the next pass. */
function pass(when: number, first: boolean, gen: number) {
  if (!ctx || !out || !buffer || gen !== generation) return;
  const d = buffer.duration;
  const x = Math.min(CROSS, d / 3);
  const gain = ctx.createGain();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  gain.connect(out);
  gain.gain.setValueAtTime(first ? 1 : 0, when);
  if (!first) gain.gain.linearRampToValueAtTime(1, when + x);
  gain.gain.setValueAtTime(1, when + d - x);
  gain.gain.linearRampToValueAtTime(0, when + d);
  src.start(when);
  const entry = { src, gain };
  sources.push(entry);
  src.onended = () => {
    sources = sources.filter((s) => s !== entry);
  };
  const nextAt = when + d - x;
  timer = setTimeout(() => pass(nextAt, false, gen), Math.max(0, (nextAt - ctx.currentTime - 1) * 1000));
}

async function start() {
  ctx = primeAudio();
  if (!ctx || !url) return;
  await load();
  if (!buffer || !ctx) return;
  if (!shouldPlay() || playing) return;
  out ??= (() => {
    const g = ctx!.createGain();
    g.gain.value = 0;
    g.connect(ctx!.destination);
    return g;
  })();
  playing = true;
  const gen = ++generation;
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(out.gain.value, t);
  out.gain.linearRampToValueAtTime(SITE_LEVEL, t + FADE_IN);
  pass(t + 0.05, true, gen);
  emit();
}

function stop() {
  if (!playing || !ctx || !out) return;
  playing = false;
  generation++;
  clearTimeout(timer);
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(out.gain.value, t);
  out.gain.linearRampToValueAtTime(0, t + FADE_OUT);
  const going = sources;
  sources = [];
  setTimeout(() => going.forEach((s) => { try { s.src.stop(); } catch { /* already ended */ } }), FADE_OUT * 1000 + 80);
  emit();
}

const shouldPlay = () => wanted && unlocked && holds === 0 && !hiddenTab;
const sync = () => (shouldPlay() ? void start() : stop());

/** The wave icon: pause or resume, and remember it. */
export function toggleSiteMusic(): void {
  wanted = !wanted;
  try {
    window.localStorage.setItem(KEY, wanted ? "on" : "off");
  } catch {
    /* fine: just not remembered */
  }
  setSound(wanted); // the soft seal sound in the owner flow follows the same choice
  unlocked = true; // this was a tap
  sync();
  emit();
}

/** The intro film asks for quiet while it plays. */
export function holdSiteMusic(hold: boolean): void {
  holds = Math.max(0, holds + (hold ? 1 : -1));
  sync();
}

export function initSiteMusic(): void {
  if (typeof window === "undefined" || !url) return;
  setSound(wanted);
  const unlock = (e: Event) => {
    if (unlocked) return;
    // a scroll or wheel is not a gesture the browser accepts; keep listening until a real tap or key press
    const c = primeAudio();
    unlocked = true;
    sync();
    if (c && c.state !== "running" && (e.type === "scroll" || e.type === "wheel" || e.type === "touchmove")) unlocked = false;
    if (unlocked) for (const n of EVENTS) window.removeEventListener(n, unlock, true);
  };
  const EVENTS = ["pointerdown", "keydown", "touchend", "wheel", "scroll"];
  for (const n of EVENTS) window.addEventListener(n, unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    hiddenTab = document.hidden;
    sync();
  });
}
