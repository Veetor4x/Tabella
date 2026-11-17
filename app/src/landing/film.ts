/**
 * The machinery behind a film: a list of beats (the opener, then for each demo screen a short illustrated scene,
 * a smooth zoom into the phone and the screen itself playing). Pure data and functions, so it can be tested without a
 * browser. introScript.ts holds the "Invite someone" film; introScriptSurprise.ts holds the "Keep it a surprise" film.
 */
import type { Sfx } from "./sfx";
import type { StoryId } from "./stories";

/** The opener: about five seconds. */
export const OPENER_MS = 5200;
/** Each demo beat: the scene, the zoom into the phone, then the screen (its own timing). */
export const STORY_MS = 3000;
export const ZOOM_MS = 900;
export const ZOOM_OUT_MS = 650;
/** The last scene has no phone: the envelope opens and the camera comes in until the message can be read. */
export const FINAL_STORY_MS = 9800;
export const VOICE_AT_MS = 300;
const TAIL_MS = 900;
/** when the screen starts, inside a beat */
export const PHONE_AT = STORY_MS + ZOOM_MS;

export interface Cue {
  /** ms from the start of the beat */
  at: number;
  sfx: Sfx;
  gain?: number;
  fadeAfter?: number;
  fadeMs?: number;
}

export interface Beat {
  /** which spoken line (index into the film's lines), if any */
  line: number | null;
  story: StoryId | null;
  /** the demo screen it ends on (index into that film's steps), if any, and how long to play it (ms) */
  step: number | null;
  /** the small label under the caption */
  label: string;
  storyMs: number;
  phoneMs: number;
  /** no phone: the scene is the whole beat */
  noPhone?: boolean;
  cues: Cue[];
}

export const at = (ms: number, sfx: Sfx, gain?: number): Cue => ({ at: ms, sfx, gain });

export type Phase = "story" | "zoom-in" | "phone" | "zoom-out";
export type FilmId = "invite" | "surprise";

export interface FilmData {
  id: FilmId;
  /** the recordings are src/assets/voice/<prefix>01.mp3 ... */
  voicePrefix: "" | "s";
  lines: readonly string[];
  /** seconds each line takes (planning and tests; the player reads the real length from the file) */
  estimates: number[];
  beats: Beat[];
}

export function makeFilm(d: FilmData) {
  const { beats: BEATS, lines: VOICE_LINES, estimates: ESTIMATED_SECONDS } = d;

  /** How long a beat lasts: its pictures, or its voice and a breath, whichever is longer. */
  function beatMs(beat: number, audioSeconds?: number): number {
    const b = BEATS[beat]!;
    if (beat === 0) return Math.max(OPENER_MS, VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[0]!) * 1000 + TAIL_MS);
    const voice = b.line === null ? 0 : VOICE_AT_MS + (audioSeconds ?? ESTIMATED_SECONDS[b.line]!) * 1000 + TAIL_MS;
    const pictures = b.noPhone ? b.storyMs : b.storyMs + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS;
    return Math.max(pictures, voice);
  }
  const VOICE_AT = BEATS.map(() => VOICE_AT_MS);

  /** What the camera shows at time t (ms) into a beat: the scene, the zoom into the phone, the screen, or the zoom out. */
  function phaseAt(beat: number, t: number, audioSeconds?: number): { phase: Phase; screenT: number } {
    const b = BEATS[beat]!;
    if (b.noPhone || t < b.storyMs) return { phase: "story", screenT: 0 };
    if (t < b.storyMs + ZOOM_MS) return { phase: "zoom-in", screenT: 0 };
    const end = beatMs(beat, audioSeconds);
    const screenT = t - b.storyMs - ZOOM_MS;
    return { phase: t >= end - ZOOM_OUT_MS ? "zoom-out" : "phone", screenT: Math.min(screenT, b.phoneMs) };
  }

  /** The cues that fall in the window (prev, now] of a beat. */
  const cuesBetween = (beat: number, prev: number, now: number): Cue[] => BEATS[beat]!.cues.filter((c) => c.at > prev && c.at <= now).sort((a, b) => a.at - b.at);

  /** Total film length (ms) with the estimated voice lengths. */
  const totalMs = () => BEATS.reduce((n, _, i) => n + beatMs(i), 0);

  return { id: d.id, voicePrefix: d.voicePrefix, BEATS, VOICE_LINES, ESTIMATED_SECONDS, VOICE_AT, beatMs, phaseAt, cuesBetween, totalMs };
}
export type Film = ReturnType<typeof makeFilm>;

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
