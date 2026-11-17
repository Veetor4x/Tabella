/**
 * When each letter of the demo letter appears: a natural, irregular pace, not a metronome.
 * If the recorded keyboard sound has been analysed (typeOnsets.ts), the text follows its key taps exactly,
 * so what you hear is what appears. Otherwise a seeded random rhythm is used.
 */
import { TYPE_ONSETS } from "./typeOnsets";

/** A gently irregular pace: quick bursts, small pauses between words, a longer breath after a comma or a full stop. */
export function seededRhythm(text: string, seed = 11): number[] {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const at: number[] = [];
  let t = 0;
  let burst = 4 + Math.floor(r() * 5);
  for (let i = 0; i < text.length; i++) {
    t += 24 + r() * 34;
    const ch = text[i]!;
    if (ch === " ") t += 16 + r() * 34;
    if (ch === "," || ch === "…") t += 100 + r() * 100;
    if (ch === "\n") t += 140 + r() * 120;
    if (--burst <= 0) {
      t += 50 + r() * 90;
      burst = 4 + Math.floor(r() * 6);
    }
    at.push(Math.round(t));
  }
  return at;
}

/** When each letter appears, spread over the recorded key taps (onsets, in ms) when there are some. */
export function rhythmFor(text: string): number[] {
  if (!TYPE_ONSETS.length) return seededRhythm(text);
  const n = text.length;
  const per = n / TYPE_ONSETS.length;
  return Array.from({ length: n }, (_, i) => TYPE_ONSETS[Math.min(TYPE_ONSETS.length - 1, Math.floor(i / per))]!);
}

/** How many letters are showing t ms after the typing began. */
export function lettersAt(schedule: number[], t: number): number {
  let n = 0;
  while (n < schedule.length && schedule[n]! <= t) n++;
  return n;
}
