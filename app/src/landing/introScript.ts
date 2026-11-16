/**
 * The intro's script and timing. Eight spoken lines, one per scene (the last scene has two screens).
 * Pure data and functions, so it can be tested without a browser.
 */
import { STEPS } from "./Demo";

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

/** Guesses (in seconds) for how long each line takes to say, until the real recording says. Calm pace. */
export const ESTIMATED_SECONDS = [4.4, 2.5, 2.3, 3.3, 4.8, 5.5, 3.4, 6.4];

/** Where in each scene the voice starts (ms). The opener leaves a moment of quiet first; the last scene lets time pass first. */
export const VOICE_AT = [600, 500, 500, 500, 500, 500, 500, 2600];

/** Opener: about five seconds. */
export const OPENER_MS = 5200;
const TAIL_MS = 900; // a breath after each line

export interface Scene {
  /** index into VOICE_LINES */
  line: number;
  /** the demo step(s) it shows; the opener shows none */
  steps: number[];
  /** the least time the visuals need (ms) */
  minMs: number;
}

export const SCENES: Scene[] = [
  { line: 0, steps: [], minMs: OPENER_MS },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ line: i + 1, steps: [i], minMs: STEPS[i]!.ms })),
  { line: 7, steps: [6, 7], minMs: STEPS[6]!.ms + STEPS[7]!.ms },
];

/** How long a scene lasts: its visuals, or its voice and a breath, whichever is longer. */
export function sceneMs(scene: number, audioSeconds?: number): number {
  const sc = SCENES[scene]!;
  const voice = (audioSeconds ?? ESTIMATED_SECONDS[sc.line]!) * 1000;
  return Math.max(sc.minMs, VOICE_AT[scene]! + voice + TAIL_MS);
}

/** Which demo step and moment a scene shows at time t (ms into the scene). The opener shows no step. */
export function stepAt(scene: number, t: number): { step: number; t: number } | null {
  const sc = SCENES[scene]!;
  if (!sc.steps.length) return null;
  if (sc.steps.length === 1) return { step: sc.steps[0]!, t };
  const first = STEPS[sc.steps[0]!]!.ms;
  return t < first ? { step: sc.steps[0]!, t } : { step: sc.steps[1]!, t: t - first };
}

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
