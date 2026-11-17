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
/** Each demo beat: the scene, the zoom into the phone, then the screen (its own timing, below). */
export const STORY_MS = 3000;
export const ZOOM_MS = 900;
export const ZOOM_OUT_MS = 650;
/** The last scene has no phone: the envelope opens and the camera comes in until the message can be read. */
export const FINAL_STORY_MS = 9800;
const VOICE_AT_MS = 300;
const TAIL_MS = 900;

export interface Cue {
  /** ms from the start of the beat */
  at: number;
  sfx: Sfx;
  gain?: number;
  fadeAfter?: number;
  fadeMs?: number;
}

export interface Beat {
  /** which spoken line (index into VOICE_LINES), if any */
  line: number | null;
  story: StoryId | null;
  /** the demo screen it ends on (index into STEPS), if any, and how long to play it (ms) */
  step: number | null;
  /** the small label under the caption */
  label: string;
  storyMs: number;
  phoneMs: number;
  /** no phone: the scene is the whole beat */
  noPhone?: boolean;
  cues: Cue[];
}

const at = (ms: number, sfx: Sfx, gain?: number): Cue => ({ at: ms, sfx, gain });
const PHONE_AT = STORY_MS + ZOOM_MS; // when the screen starts, inside a beat

export const BEATS: Beat[] = [
  { line: 0, story: null, step: null, label: "", storyMs: 0, phoneMs: 0, cues: [at(3000, "stamp", 0.8)] },
  // 1. a soft page turn; then the letter is typed on the phone, with a recorded keyboard that follows the text
  { line: 1, story: "desk", step: 0, label: "Write", storyMs: STORY_MS, phoneMs: 11500, cues: [at(0, "t-page"), at(2300, "rustle", 0.7), at(PHONE_AT + 900, "type")] },
  // 2. a quiet breath of air; two chairs set down one after the other
  { line: 2, story: "chairs", step: 1, label: "People", storyMs: STORY_MS, phoneMs: 8000, cues: [at(0, "t-air"), at(550, "tap", 0.6), at(1550, "tap", 0.6), at(PHONE_AT + 3300, "tap"), at(PHONE_AT + 7600, "tap")] },
  // 3. a light paper slide
  { line: 3, story: "shield", step: 2, label: "Guardian", storyMs: STORY_MS, phoneMs: 4600, cues: [at(0, "t-slide"), at(PHONE_AT + 1700, "tap")] },
  // 4. a muted felt tap, then the calendar pages
  { line: 4, story: "calendar", step: 3, label: "Timing", storyMs: STORY_MS, phoneMs: 4400, cues: [at(0, "t-felt"), at(350, "flip"), at(850, "flip"), at(1350, "flip"), at(1850, "flip"), at(2350, "flip"), at(PHONE_AT + 2200, "tap")] },
  // 5. a soft brush of fabric; the letter is folded and the seal pressed into wax
  { line: 5, story: "seal", step: 4, label: "Seal", storyMs: STORY_MS, phoneMs: 10500, cues: [at(0, "t-fabric"), at(350, "fold"), at(2300, "stamp"), at(PHONE_AT + 8300, "stamp", 0.7)] },
  // 6. distant water, very low
  { line: 6, story: "horizon", step: 5, label: "I'm still here", storyMs: STORY_MS, phoneMs: 5600, cues: [at(0, "t-sea"), at(2000, "tap", 0.5), at(PHONE_AT + 2400, "tap")] },
  // 7. a room settling; an old wall clock that slows and fades, not sped up
  { line: null, story: "clock", step: 6, label: "Time passes", storyMs: STORY_MS, phoneMs: 6600, cues: [at(0, "t-room"), { at: 150, sfx: "clock", fadeAfter: 6000, fadeMs: 3800 }] },
  // 8. tissue paper; then the seal cracks and the letter slides out, with no chime
  { line: 7, story: "open", step: null, label: "Mia opens it", storyMs: FINAL_STORY_MS, phoneMs: 0, noPhone: true, cues: [at(0, "t-tissue"), at(450, "crack"), at(1750, "open")] },
];

/** How long a beat lasts: its pictures, or its voice and a breath, whichever is longer. */
export function beatMs(beat: number, audioSeconds?: number): number {
  const b = BEATS[beat]!;
  if (beat === 0) return Math.max(OPENER_MS, VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[0]!) * 1000 + TAIL_MS);
  const voice = b.line === null ? 0 : VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[b.line]!) * 1000 + TAIL_MS;
  const pictures = b.noPhone ? b.storyMs : b.storyMs + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS;
  return Math.max(pictures, voice);
}
export const VOICE_AT = BEATS.map(() => VOICE_AT_MS);

export type Phase = "story" | "zoom-in" | "phone" | "zoom-out";
/** What the camera shows at time t (ms) into a beat: the scene, the zoom into the phone, the screen, or the zoom out. */
export function phaseAt(beat: number, t: number, audioSeconds?: number): { phase: Phase; screenT: number } {
  const b = BEATS[beat]!;
  if (b.noPhone || t < b.storyMs) return { phase: "story", screenT: 0 };
  if (t < b.storyMs + ZOOM_MS) return { phase: "zoom-in", screenT: 0 };
  const end = beatMs(beat, audioSeconds);
  const screenT = t - b.storyMs - ZOOM_MS;
  return { phase: t >= end - ZOOM_OUT_MS ? "zoom-out" : "phone", screenT: Math.min(screenT, b.phoneMs) };
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
