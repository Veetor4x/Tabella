/**
 * The "Invite someone" film's script. Eight spoken lines. (The machinery is in film.ts; the "Keep it a surprise" film
 * is in introScriptSurprise.ts.)
 */
import { STEPS } from "./Demo";
import { FINAL_STORY_MS, OPENER_MS, PHONE_AT, STORY_MS, ZOOM_MS, ZOOM_OUT_MS, at, makeFilm, sentenceStarts, sentences, type Beat, type Cue, type Phase } from "./film";

export { FINAL_STORY_MS, OPENER_MS, STORY_MS, ZOOM_MS, ZOOM_OUT_MS, sentenceStarts, sentences };
export type { Beat, Cue, Phase };

const VOICE_LINES = [
  "Some things should be said one day. Tabella helps you say them.",
  "Write a letter for the people you love.",
  "Choose who can open it.",
  "Pick someone you trust to watch over it.",
  "Choose when it should open. If you go quiet for a while.",
  "Seal it. It's locked on your phone, safe even from future super-computers.",
  "Every so often, just tap: I'm still here.",
  "And if one day you can't, your letter reaches them. Sealed today. Opened when it matters.",
] as const;

const INVITE_ESTIMATES = [4.6, 2.5, 1.8, 2.8, 4.0, 5.5, 3.5, 6.8];

const INVITE_BEATS: Beat[] = [
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

export const INVITE_FILM = makeFilm({ id: "invite", voicePrefix: "", lines: VOICE_LINES, estimates: INVITE_ESTIMATES, beats: INVITE_BEATS });
export const { BEATS, ESTIMATED_SECONDS, VOICE_AT, beatMs, phaseAt, cuesBetween, totalMs } = INVITE_FILM;
export { VOICE_LINES, STEPS };
