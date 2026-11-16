/**
 * The intro's script and timeline. Eight spoken lines. The film is a list of beats: the opener, then for each demo
 * screen a short illustrated story scene, a smooth zoom into the phone, and the screen itself playing.
 * Pure data and functions, so it can be tested without a browser.
 */
import { STEPS } from "./Demo";
import type { Sfx } from "./sfx";
import type { StoryId } from "./stories";

export const VOICE_LINES = [
  "Some things should be said one day. Tabella helps you say them.",
  "Write a letter for the people you love.",
  "Choose who can open it.",
  "Pick someone you trust to watch over it.",
  "Choose when it should open. If you go quiet for a while.",
  "Seal it. It's locked on your phone, safe even from future super-computers.",
  "Every so often, just tap: I'm still here.",
  "And if one day you can't, your letter reaches them. Sealed today. Opened when it matters.",
] as const;

/** How long each recorded line takes (seconds). The player reads the real length from the file; this is for planning and tests. */
export const ESTIMATED_SECONDS = [4.6, 2.5, 1.8, 2.8, 4.0, 5.5, 3.5, 6.8];

/** The opener: about five seconds. */
export const OPENER_MS = 5200;
/** Each demo beat: the story scene, the zoom into the phone, then the screen (its own timing, below). */
export const STORY_MS = 3000;
export const ZOOM_MS = 900;
export const ZOOM_OUT_MS = 650;
const VOICE_AT_MS = 300;
const TAIL_MS = 900;

export interface Cue {
  /** ms from the start of the beat */
  at: number;
  sfx: Sfx;
  gain?: number;
}

export interface Beat {
  /** which spoken line (index into VOICE_LINES), if any */
  line: number | null;
  story: StoryId | null;
  /** the demo screen it ends on (index into STEPS), and how long to play it (ms) */
  step: number | null;
  phoneMs: number;
  cues: Cue[];
}

const PHONE_AT = STORY_MS + ZOOM_MS; // when the screen starts, inside a beat
const at = (ms: number, sfx: Sfx, gain?: number): Cue => ({ at: ms, sfx, gain });
/** soft key ticks while the letter is typed (the screen types from 0.9 s, one letter every 48 ms; a tick every third) */
const typing: Cue[] = Array.from({ length: 33 }, (_, i) => at(PHONE_AT + 950 + i * 144, "type", 0.8 + (i % 3) * 0.1));
/** a clock that ticks faster and faster */
const ticks: Cue[] = (() => {
  const out: Cue[] = [];
  let t = 200;
  let gap = 520;
  while (t < PHONE_AT + 5600) {
    out.push(at(t, "tick"));
    t += gap;
    gap = Math.max(170, gap * 0.93);
  }
  return out;
})();

export const BEATS: Beat[] = [
  { line: 0, story: null, step: null, phoneMs: 0, cues: [at(3000, "tone")] },
  { line: 1, story: "desk", step: 0, phoneMs: 6200, cues: [at(1500, "pop", 0.5), at(2000, "rustle"), at(2150, "whoosh"), ...typing, at(PHONE_AT + 6000, "rustle", 0.6)] },
  { line: 2, story: "family", step: 1, phoneMs: 8000, cues: [at(550, "pop"), at(1350, "pop"), at(1100, "whoosh", 0.5), at(2750, "whoosh"), at(PHONE_AT + 3300, "pop", 0.8), at(PHONE_AT + 7600, "pop", 0.8)] },
  { line: 3, story: "thumbs", step: 2, phoneMs: 4600, cues: [at(500, "whoosh", 0.4), at(1100, "glint"), at(2750, "whoosh"), at(PHONE_AT + 1700, "pop", 0.7)] },
  { line: 4, story: "calendar", step: 3, phoneMs: 4400, cues: [at(350, "flip"), at(750, "flip"), at(1150, "flip"), at(1550, "flip"), at(1950, "flip"), at(2550, "pop", 0.6), at(2750, "whoosh"), at(PHONE_AT + 2200, "pop", 0.7)] },
  {
    line: 5,
    story: "seal",
    step: 4,
    phoneMs: 10500,
    cues: [at(350, "fold"), at(1150, "rustle", 0.6), at(1550, "whoosh", 0.4), at(1950, "stamp"), at(2000, "glint", 0.8), at(2750, "whoosh"), at(PHONE_AT + 7000, "whoosh", 0.5), at(PHONE_AT + 8300, "stamp", 0.7)],
  },
  { line: 6, story: "beach", step: 5, phoneMs: 5600, cues: [at(500, "pop", 0.6), at(1500, "pop", 0.8), at(1600, "glint", 0.7), at(2750, "whoosh"), at(PHONE_AT + 2400, "pop", 0.8)] },
  { line: null, story: "race", step: 6, phoneMs: 6600, cues: [at(100, "whoosh", 0.5), ...ticks, at(PHONE_AT + 5400, "glint", 0.8)] },
  { line: 7, story: "gift", step: 7, phoneMs: 8600, cues: [at(1800, "glint"), at(2750, "whoosh"), at(PHONE_AT + 1700, "stamp", 0.6), at(PHONE_AT + 1750, "chime"), at(PHONE_AT + 1900, "glint", 0.9)] },
];

/** The demo screen's own timing for a beat's screen (ms). Matches the screens' internal schedules. */
export function phoneMsOf(beat: number): number {
  return BEATS[beat]!.phoneMs;
}

/** How long a beat lasts: its pictures, or its voice and a breath, whichever is longer. */
export function beatMs(beat: number, audioSeconds?: number): number {
  const b = BEATS[beat]!;
  if (beat === 0) return Math.max(OPENER_MS, VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[0]!) * 1000 + TAIL_MS);
  const voice = b.line === null ? 0 : VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[b.line]!) * 1000 + TAIL_MS;
  return Math.max(STORY_MS + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS, voice);
}
export const VOICE_AT = BEATS.map(() => VOICE_AT_MS);

export type Phase = "story" | "zoom-in" | "phone" | "zoom-out";
/** What the camera shows at time t (ms) into beat: the story, the zoom into the phone, the screen, or the zoom out. */
export function phaseAt(beat: number, t: number, audioSeconds?: number): { phase: Phase; screenT: number } {
  if (t < STORY_MS) return { phase: "story", screenT: 0 };
  if (t < STORY_MS + ZOOM_MS) return { phase: "zoom-in", screenT: 0 };
  const end = beatMs(beat, audioSeconds);
  const screenT = t - STORY_MS - ZOOM_MS;
  return { phase: t >= end - ZOOM_OUT_MS ? "zoom-out" : "phone", screenT: Math.min(screenT, BEATS[beat]!.phoneMs) };
}

/** The cues that fall in the window (prev, now] of a beat. */
export function cuesBetween(beat: number, prev: number, now: number): Cue[] {
  return BEATS[beat]!.cues.filter((c) => c.at > prev && c.at <= now).sort((a, b) => a.at - b.at);
}

/** Total film length (ms) with the estimated voice lengths. */
export const totalMs = () => BEATS.reduce((n, _, i) => n + beatMs(i), 0);
export { STEPS };

/** "Seal it. It's locked…" -> sentences, so the caption can follow the voice one sentence at a time. */
export function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:["”']?)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/** When (ms after the voice starts) each sentence begins, by its share of the characters. */
export function sentenceStarts(text: string, audioSeconds: number): number[] {
  const parts = sentences(text);
  const total = parts.reduce((n, p) => n + p.length, 0);
  let acc = 0;
  return parts.map((p) => {
    const at = (acc / total) * audioSeconds * 1000;
    acc += p.length;
    return Math.round(at);
  });
}
