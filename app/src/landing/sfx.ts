/**
 * The intro's sound: quiet recorded-style effects (made with ElevenLabs sound effects), a calm music bed under
 * everything, and ducking (the music drops while the voice speaks). Everything goes through one audio engine so Mute is
 * one switch. Safe without audio: when the browser or a file is missing, every call is silent and does nothing.
 *
 * What is NOT here, on purpose: whooshes, chimes, "selection" or "conclusion" sounds.
 */
import { isSoundOn, primeAudio } from "../lib/sound";

const sfxFiles = import.meta.glob<string>("../assets/sfx/*.mp3", { eager: true, query: "?url", import: "default" });
const musicFiles = import.meta.glob<string>("../assets/music/*.mp3", { eager: true, query: "?url", import: "default" });

/** Each name is one recording: a scene transition ("t-...") or a sound inside a scene. */
export type Sfx =
  | "type" // soft phone-keyboard typing, irregular rhythm
  | "clock" // an old mechanical wall clock, slowing
  | "rustle" // a sheet of paper picked up
  | "fold" // a letter being folded
  | "flip" // a calendar page turning
  | "tap" // a finger tapping glass
  | "stamp" // a seal pressed into wax
  | "crack" // a wax seal cracking
  | "open" // an envelope opening, the letter sliding out
  | "t-page" // transitions, one for each scene, all different, all very low
  | "t-air"
  | "t-slide"
  | "t-felt"
  | "t-fabric"
  | "t-sea"
  | "t-room"
  | "t-tissue";

export const SFX_NAMES: Sfx[] = ["type", "clock", "rustle", "fold", "flip", "tap", "stamp", "crack", "open", "t-page", "t-air", "t-slide", "t-felt", "t-fabric", "t-sea", "t-room", "t-tissue"];

/** How loud each one is (0 to 1): all of them quiet, the transitions very low. */
export const LEVEL: Record<Sfx, number> = {
  type: 0.34, clock: 0.3, rustle: 0.3, fold: 0.3, flip: 0.3, tap: 0.32, stamp: 0.42, crack: 0.4, open: 0.42,
  "t-page": 0.16, "t-air": 0.14, "t-slide": 0.15, "t-felt": 0.16, "t-fabric": 0.14, "t-sea": 0.13, "t-room": 0.12, "t-tissue": 0.14,
};
export const MUSIC_LEVEL = 0.22; // the bed on its own
export const MUSIC_DUCKED = 0.08; // while the voice speaks

export interface PlayOpts {
  gain?: number;
  /** fade the sound out, starting this many ms after it starts, over fadeMs (a clock that slows and fades away) */
  fadeAfter?: number;
  fadeMs?: number;
}

declare global {
  interface Window {
    /** the test sets this to an array to hear what the intro played and when (used to mix the recording's sound) */
    __tabellaAudioLog?: { kind: string; name?: string; gain?: number; fadeAfter?: number; fadeMs?: number; at: number }[];
  }
}
const log = (e: { kind: string; name?: string; gain?: number; fadeAfter?: number; fadeMs?: number }) => window.__tabellaAudioLog?.push({ ...e, at: Date.now() });

let ctx: AudioContext | undefined;
let bus: GainNode | undefined; // everything but the voice
let musicGain: GainNode | undefined;
let music: HTMLAudioElement | undefined;
let muted = false;
const buffers = new Map<Sfx, AudioBuffer>();
let loading: Promise<void> | undefined;
const live = new Set<AudioBufferSourceNode>();

export const hasMusic = () => Object.keys(musicFiles).length > 0;
const pathOf = (name: Sfx) => Object.keys(sfxFiles).find((p) => p.endsWith(`/${name}.mp3`));

/** Wake the engine and load the effects. Needs a tap first (the intro's "Yes" is that tap). */
export function startEngine(): AudioContext | undefined {
  ctx = primeAudio();
  if (!ctx) return;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = muted ? 0 : 1;
    bus.connect(ctx.destination);
  }
  loading ??= Promise.all(
    SFX_NAMES.map(async (name) => {
      const p = pathOf(name);
      if (!p) return;
      try {
        const data = await (await fetch(sfxFiles[p]!)).arrayBuffer();
        buffers.set(name, await ctx!.decodeAudioData(data));
      } catch {
        /* that effect is just silent */
      }
    }),
  ).then(() => undefined);
  return ctx;
}

/** From the tap on "Yes": the engine, the effects, and the music bed fading in. */
export function startIntroSound(): void {
  const c = startEngine();
  if (!c) return;
  const src = Object.values(musicFiles)[0];
  if (src && !music) {
    music = new Audio(src);
    music.loop = true;
    music.preload = "auto";
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    c.createMediaElementSource(music).connect(musicGain).connect(bus!);
  }
  if (music && musicGain) {
    void music.play().catch(() => {});
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, c.currentTime, 1.2);
    log({ kind: "music" });
  }
}

export function playSfx(name: Sfx, o: PlayOpts = {}): void {
  log({ kind: "sfx", name, gain: o.gain, fadeAfter: o.fadeAfter, fadeMs: o.fadeMs });
  const b = buffers.get(name);
  if (!ctx || !bus || !b || muted) return;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  const level = LEVEL[name] * (o.gain ?? 1);
  g.gain.value = level;
  if (o.fadeAfter !== undefined) {
    const t0 = ctx.currentTime + o.fadeAfter / 1000;
    g.gain.setValueAtTime(level, t0);
    g.gain.linearRampToValueAtTime(0.0001, t0 + (o.fadeMs ?? 1500) / 1000);
  }
  src.buffer = b;
  src.connect(g).connect(bus);
  src.onended = () => live.delete(src);
  live.add(src);
  src.start();
}

/** Stop any effect that is still sounding (a skip, a jump, the end of the film). */
export function stopSfx(): void {
  live.forEach((s) => {
    try {
      s.stop();
    } catch {
      /* already over */
    }
  });
  live.clear();
}

/** The soft wax-press when a letter is sealed in the app itself (only if the person switched sound on). */
export async function playSealPress(): Promise<void> {
  if (!isSoundOn()) return;
  const c = startEngine();
  if (!c) return;
  await loading;
  playSfx("stamp", { gain: 1.1 });
}

/** Mute switches the effects and the music together (the voice is muted by its own audio elements). */
export function setIntroMuted(m: boolean): void {
  muted = m;
  if (bus && ctx) bus.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  if (m) stopSfx();
}

let ducked = false;
/** The music drops while the voice speaks and comes back after. */
export function duckMusic(on: boolean): void {
  if (on === ducked) return;
  ducked = on;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? MUSIC_DUCKED : MUSIC_LEVEL, ctx.currentTime, 0.3);
  log({ kind: on ? "duck" : "unduck" });
}

export function pauseMusic(paused: boolean): void {
  if (!music) return;
  if (paused) music.pause();
  else void music.play().catch(() => {});
}

export function stopIntroSound(): void {
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  const m = music;
  setTimeout(() => m?.pause(), 900);
  stopSfx();
  log({ kind: "music-stop" });
}
