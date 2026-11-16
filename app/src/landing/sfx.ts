/**
 * The intro's sound: soft effects (small pre-made files), a calm music bed under everything, and ducking
 * (the music drops while the voice speaks). Everything runs through one audio engine so Mute is one switch.
 * Safe without audio: when the browser or the files are missing, every call is silent and does nothing.
 */
import { primeAudio } from "../lib/sound";

const sfxFiles = import.meta.glob<string>("../assets/sfx/*.wav", { eager: true, query: "?url", import: "default" });
const musicFiles = import.meta.glob<string>("../assets/music/*.mp3", { eager: true, query: "?url", import: "default" });

export type Sfx = "type" | "rustle" | "fold" | "whoosh" | "pop" | "stamp" | "tick" | "flip" | "chime" | "glint" | "tone";

/** How loud each effect is (0 to 1): all of them soft. */
const LEVEL: Record<Sfx, number> = { type: 0.32, rustle: 0.4, fold: 0.4, whoosh: 0.32, pop: 0.5, stamp: 0.55, tick: 0.3, flip: 0.35, chime: 0.5, glint: 0.28, tone: 0.55 };
export const MUSIC_LEVEL = 0.22; // the bed on its own
export const MUSIC_DUCKED = 0.08; // while the voice speaks

declare global {
  interface Window {
    /** the test sets this to an array to hear what the intro played and when (used to mix the recording's sound) */
    __tabellaAudioLog?: { kind: string; name?: string; gain?: number; at: number }[];
  }
}
const log = (e: { kind: string; name?: string; gain?: number }) => window.__tabellaAudioLog?.push({ ...e, at: Date.now() });

let ctx: AudioContext | undefined;
let bus: GainNode | undefined; // everything but the voice
let musicGain: GainNode | undefined;
let music: HTMLAudioElement | undefined;
let muted = false;
const buffers = new Map<Sfx, AudioBuffer>();
let loading: Promise<void> | undefined;

export const hasMusic = () => Object.keys(musicFiles).length > 0;

/** From the tap on "Yes": wake the engine, load the effects, start the music bed. */
export function startIntroSound(): void {
  ctx = primeAudio();
  if (!ctx) return;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = muted ? 0 : 1;
    bus.connect(ctx.destination);
  }
  loading ??= Promise.all(
    (Object.keys(sfxFiles) as string[]).map(async (path) => {
      const name = /\/([a-z]+)\.wav$/.exec(path)?.[1] as Sfx | undefined;
      if (!name) return;
      try {
        const data = await (await fetch(sfxFiles[path]!)).arrayBuffer();
        buffers.set(name, await ctx!.decodeAudioData(data));
      } catch {
        /* that effect is just silent */
      }
    }),
  ).then(() => undefined);
  const src = Object.values(musicFiles)[0];
  if (src && !music) {
    music = new Audio(src);
    music.loop = true;
    music.preload = "auto";
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    ctx.createMediaElementSource(music).connect(musicGain).connect(bus);
  }
  if (music && musicGain) {
    void music.play().catch(() => {});
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 1.2); // fades in
    log({ kind: "music" });
  }
}

export function playSfx(name: Sfx, gain = 1): void {
  log({ kind: "sfx", name, gain });
  const b = buffers.get(name);
  if (!ctx || !bus || !b || muted) return;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = LEVEL[name] * gain;
  src.buffer = b;
  src.connect(g).connect(bus);
  src.start();
}

/** Mute switches the effects and the music together (the voice is muted by its own audio elements). */
export function setIntroMuted(m: boolean): void {
  muted = m;
  if (bus && ctx) bus.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
}

/** The music drops while the voice speaks and comes back after. */
let ducked = false;
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
  log({ kind: "music-stop" });
}
