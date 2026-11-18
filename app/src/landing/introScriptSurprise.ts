/**
 * The "Keep it a surprise" film's script: nine spoken lines, the same voice ("Autumn Veil") and style as the other film.
 * Every line is recorded (s01.mp3 to s09.mp3). Lines 1, 5 and 7 are the same words as the first film's, so they reuse those recordings (s01, s05, s07).
 */
import { STEPS_SURPRISE } from "./Demo";
import { PHONE_AT, STORY_MS, at, makeFilm, type Beat } from "./film";

export const SURPRISE_LINES = [
  "Some things should be said one day. Tabella helps you say them.",
  "Write a letter for someone you love.",
  "Keep it a surprise. Add how to reach them, and a question only they can answer.",
  "Add someone you trust, in case they can't be reached.",
  "Choose when it should open. If you go quiet for a while.",
  "Seal it. Safe even from future super-computers.",
  "Every so often, just tap: I'm still here.",
  "And if one day you can't, Tabella finds them, and lets them know.",
  "They answer the question only they know, and your words reach them. Sealed today. Opened when it matters.",
] as const;

const ESTIMATES = [4.6, 2.1, 5.1, 3.0, 4.0, 3.9, 3.5, 4.0, 7.7];

/** The last scene: a question card (2.2 s), then the envelope opens and the camera comes in. */
export const SURPRISE_FINAL_MS = 12_000;

const BEATS: Beat[] = [
  { line: 0, story: null, step: null, label: "", storyMs: 0, phoneMs: 0, cues: [at(3000, "stamp", 0.8)] },
  // 1. a soft page turn; the letter is typed on the phone
  { line: 1, story: "desk", step: 0, label: "Write", storyMs: STORY_MS, phoneMs: 11500, cues: [at(0, "t-page"), at(2300, "rustle", 0.7), at(PHONE_AT + 900, "type")] },
  // 2. a quiet breath of air; how to reach them, and the question
  { line: 2, story: "reach", step: 1, label: "Reach them", storyMs: STORY_MS, phoneMs: 9000, cues: [at(0, "t-air"), at(600, "tap", 0.5), at(1100, "tap", 0.5), at(PHONE_AT + 1800, "type", 0.7), at(PHONE_AT + 6200, "tap")] },
  // 3. a light paper slide; a second person
  { line: 3, story: "backup", step: 2, label: "Backup", storyMs: STORY_MS, phoneMs: 7000, cues: [at(0, "t-slide"), at(PHONE_AT + 1500, "type", 0.6)] },
  // 4. a muted felt tap, then the calendar pages
  { line: 4, story: "calendar", step: 3, label: "Timing", storyMs: STORY_MS, phoneMs: 4400, cues: [at(0, "t-felt"), at(350, "flip"), at(850, "flip"), at(1350, "flip"), at(1850, "flip"), at(2350, "flip"), at(PHONE_AT + 2200, "tap")] },
  // 5. a soft brush of fabric; the letter is folded and sealed
  { line: 5, story: "seal", step: 4, label: "Seal", storyMs: STORY_MS, phoneMs: 10500, cues: [at(0, "t-fabric"), at(350, "fold"), at(2300, "stamp"), at(PHONE_AT + 8300, "stamp", 0.7)] },
  // 6. distant water, very low
  { line: 6, story: "horizon", step: 5, label: "I'm still here", storyMs: STORY_MS, phoneMs: 5600, cues: [at(0, "t-sea"), at(2000, "tap", 0.5), at(PHONE_AT + 2400, "tap")] },
  // 7. a room settling; an old wall clock that slows and fades
  { line: null, story: "clock", step: 6, label: "Time passes", storyMs: STORY_MS, phoneMs: 6600, cues: [at(0, "t-room"), { at: 150, sfx: "clock", fadeAfter: 6000, fadeMs: 3800 }] },
  // 8. a soft knock on wood; an email, a reminder, a second person
  { line: 7, story: "find", step: 7, label: "Found", storyMs: STORY_MS, phoneMs: 9000, cues: [at(0, "t-wood"), at(300, "tap", 0.5), at(1100, "tap", 0.5), at(PHONE_AT + 1200, "tap", 0.6), at(PHONE_AT + 3200, "tap", 0.6)] },
  // 9. tissue paper; the question, then the seal cracks and the letter slides out
  { line: 8, story: "openq", step: null, label: "They open it", storyMs: SURPRISE_FINAL_MS, phoneMs: 0, noPhone: true, cues: [at(0, "t-tissue"), at(2650, "crack"), at(3950, "open")] },
];

export const SURPRISE_FILM = makeFilm({ id: "surprise", voicePrefix: "s", lines: SURPRISE_LINES, estimates: ESTIMATES, beats: BEATS });
export { STEPS_SURPRISE };
