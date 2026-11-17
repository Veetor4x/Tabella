import { readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { getIntroChoice, setIntroChoice } from "../src/lib/intro";
import { IntroPlayer, IntroPrompt } from "../src/landing/Intro";
import { Story, STORY_ALT, type StoryId } from "../src/landing/stories";
import { readFileSync } from "node:fs";
import { BEATS, ESTIMATED_SECONDS, FINAL_STORY_MS, OPENER_MS, STORY_MS, VOICE_AT, VOICE_LINES, ZOOM_MS, ZOOM_OUT_MS, beatMs, cuesBetween, phaseAt, sentenceStarts, sentences, totalMs } from "../src/landing/introScript";
import { LEVEL, MUSIC_DUCKED, MUSIC_LEVEL } from "../src/landing/sfx";
import { SURPRISE_FILM } from "../src/landing/introScriptSurprise";
import { STEPS_SURPRISE } from "../src/landing/Demo";
import { fitRhythm, lettersAt, seededRhythm } from "../src/landing/rhythm";
import { LETTER, WRITE_TYPING_MS } from "../src/landing/Demo";
import { STEPS } from "../src/landing/Demo";

describe("the voiceover script", () => {
  it("is exactly the eight lines, in order", () => {
    expect([...VOICE_LINES]).toEqual([
      "Some things should be said one day. Tabella helps you say them.",
      "Write a letter for the people you love.",
      "Choose who can open it.",
      "Pick someone you trust to watch over it.",
      "Choose when it should open. If you go quiet for a while.",
      "Seal it. It's locked on your phone, safe even from future super-computers.",
      "Every so often, just tap: I'm still here.",
      "And if one day you can't, your letter reaches them. Sealed today. Opened when it matters.",
    ]);
  });
  it("captions follow the voice a sentence at a time", () => {
    expect(sentences(VOICE_LINES[0])).toEqual(["Some things should be said one day.", "Tabella helps you say them."]);
    expect(sentences(VOICE_LINES[7])).toHaveLength(3);
    const starts = sentenceStarts(VOICE_LINES[7], 6);
    expect(starts[0]).toBe(0);
    expect(starts[2]).toBeGreaterThan(starts[1]!);
    expect(starts[2]).toBeLessThan(5300);
  });
  it("all eight recordings exist, named 01.mp3 to 08.mp3, and the browser's own voice is never used", () => {
    const files = readdirSync(new URL("../src/assets/voice/", import.meta.url)).filter((f) => f.endsWith(".mp3"));
    expect(files.filter((f) => /^0\d\.mp3$/.test(f)).sort()).toEqual(["01.mp3", "02.mp3", "03.mp3", "04.mp3", "05.mp3", "06.mp3", "07.mp3", "08.mp3"]); // all eight lines of the first film are recorded
    for (const f of files) expect(f).toMatch(/^s?0[1-9]\.mp3$/); // the Surprise film's lines are s01.mp3 to s09.mp3
    for (const f of ["../src/landing/Intro.tsx", "../src/landing/voice.ts", "../src/landing/sfx.ts"]) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/);
  });
});

describe("the film: opener, then a scene, a zoom and a screen for each step, and a final scene with no phone", () => {
  it("has the opener and eight beats, each demo screen preceded by its own scene", () => {
    expect(BEATS).toHaveLength(9);
    expect(BEATS.map((b) => b.story)).toEqual([null, "desk", "chairs", "shield", "calendar", "seal", "horizon", "clock", "open"]);
    expect(BEATS.map((b) => b.step)).toEqual([null, 0, 1, 2, 3, 4, 5, 6, null]);
    expect(BEATS.filter((b) => b.line !== null).map((b) => b.line)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(BEATS[7]!.line).toBeNull(); // time passes: the clock, the music, no voice
    expect(BEATS[8]!.noPhone).toBe(true);
  });
  it("every beat is long enough for its scene, the zoom, its screen and its line", () => {
    BEATS.forEach((b, i) => {
      if (i === 0) return expect(beatMs(0)).toBeGreaterThanOrEqual(OPENER_MS);
      expect(beatMs(i)).toBeGreaterThanOrEqual(b.noPhone ? b.storyMs : b.storyMs + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS);
      if (b.line !== null) expect(beatMs(i, 40)).toBeGreaterThan(40_000); // a long recording stretches the beat, never cuts it off
    });
    BEATS.filter((b) => !b.noPhone && b.story).forEach((b) => expect(b.storyMs).toBeLessThanOrEqual(3200)); // "a 2 to 3 second scene"
    expect(totalMs()).toBeGreaterThan(70_000);
    expect(totalMs()).toBeLessThan(140_000);
  });
  it("the final scene gives the zoom time: the envelope opens, then the camera comes in over 2 to 3 seconds and holds", () => {
    expect(FINAL_STORY_MS).toBeGreaterThanOrEqual(8000);
    const src = readFileSync(new URL("../src/landing/stories.tsx", import.meta.url), "utf8");
    const zoom = /dur = ([0-9.]+), delay = ([0-9.]+)/.exec(src)!;
    expect(+zoom[1]!).toBeGreaterThanOrEqual(2);
    expect(+zoom[1]!).toBeLessThanOrEqual(3);
    expect(FINAL_STORY_MS / 1000 - (+zoom[2]! + +zoom[1]!)).toBeGreaterThanOrEqual(1.5); // a moment to hold on the message
    expect(src).toContain("cubic-bezier"); // eased
  });
  it("the screen plays no longer than the demo screen's own schedule", () => {
    BEATS.forEach((b) => b.step !== null && expect(b.phoneMs).toBeLessThanOrEqual(STEPS[b.step]!.ms + 400));
  });
  it("the camera goes scene, zoom in, phone, zoom out (and stays on the scene when there is no phone)", () => {
    const last = beatMs(1);
    expect(phaseAt(1, 500).phase).toBe("story");
    expect(phaseAt(1, STORY_MS + 100).phase).toBe("zoom-in");
    expect(phaseAt(1, STORY_MS + ZOOM_MS + 500)).toEqual({ phase: "phone", screenT: 500 });
    expect(phaseAt(1, last - 100).phase).toBe("zoom-out");
    expect(phaseAt(8, 7000).phase).toBe("story");
  });
  it("the voice starts inside its beat and the line fits before the beat ends", () => {
    BEATS.forEach((b, i) => b.line !== null && i > 0 && expect(VOICE_AT[i]! + ESTIMATED_SECONDS[b.line]! * 1000).toBeLessThan(beatMs(i)));
  });
});

describe("sound: recorded-style effects only", () => {
  const names = () => new Set(readdirSync(new URL("../src/assets/sfx/", import.meta.url)).map((f) => f.replace(/\.mp3$/, "")));
  it("has no whoosh, no chime, no tone, no glint and no synthesised files (all are mp3 recordings)", () => {
    const files = readdirSync(new URL("../src/assets/sfx/", import.meta.url));
    for (const f of files) expect(f).toMatch(/\.mp3$/);
    for (const banned of ["whoosh", "swoosh", "chime", "tone", "glint", "pop", "tick"]) expect(files.some((f) => f.includes(banned)), banned).toBe(false);
    const code = readFileSync(new URL("../src/landing/introScript.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/landing/sfx.ts", import.meta.url), "utf8");
    expect(code).not.toMatch(/"whoosh"|"chime"|"glint"|"tone"|createOscillator/);
  });
  it("every cue names an effect that exists as a file, inside its beat", () => {
    const have = names();
    BEATS.forEach((b, i) => b.cues.forEach((c) => {
      expect(have.has(c.sfx), c.sfx).toBe(true);
      expect(c.at).toBeGreaterThanOrEqual(0);
      expect(c.at).toBeLessThan(beatMs(i));
    }));
  });
  it("each scene has its own quiet transition, all different, at the very start, and each lower than the other effects", () => {
    const transitions = BEATS.slice(1).map((b) => b.cues.find((c) => c.at === 0 && c.sfx.startsWith("t-"))?.sfx);
    expect(transitions.every(Boolean)).toBe(true);
    expect(new Set(transitions).size).toBe(8);
    for (const t of transitions) expect(LEVEL[t!]).toBeLessThanOrEqual(0.16);
    const others = Object.entries(LEVEL).filter(([k]) => !k.startsWith("t-")).map(([, v]) => v);
    expect(Math.max(...Object.entries(LEVEL).filter(([k]) => k.startsWith("t-")).map(([, v]) => v))).toBeLessThan(Math.min(...others));
  });
  it("covers the scenes: keyboard typing, paper, fold, calendar flips, wax stamp, a real clock, the seal cracking, the envelope opening", () => {
    const all = new Set(BEATS.flatMap((b) => b.cues.map((c) => c.sfx)));
    for (const n of ["type", "rustle", "fold", "flip", "stamp", "clock", "crack", "open"]) expect(all.has(n as never), n).toBe(true);
    expect(BEATS[1]!.cues.some((c) => c.sfx === "type")).toBe(true);
    expect(BEATS[4]!.cues.filter((c) => c.sfx === "flip").length).toBeGreaterThanOrEqual(4);
  });
  it("the clock is one natural recording that fades away, not a sped-up series of ticks", () => {
    const clocks = BEATS.flatMap((b) => b.cues.filter((c) => c.sfx === "clock"));
    expect(clocks).toHaveLength(1);
    expect(clocks[0]!.fadeAfter).toBeGreaterThan(3000);
    expect(clocks[0]!.fadeMs).toBeGreaterThanOrEqual(2500);
    expect(BEATS.flatMap((b) => b.cues).filter((c) => c.sfx === "tap").length).toBeGreaterThan(0);
  });
  it("a window of time returns exactly the cues inside it", () => {
    expect(cuesBetween(2, -1, 2000).map((c) => c.sfx)).toEqual(["t-air", "tap", "tap"]);
    expect(cuesBetween(2, 500, 600)).toHaveLength(1);
    expect(cuesBetween(2, 600, 700)).toHaveLength(0);
  });
  it("is soft: no effect louder than 0.45, the bed quiet and ducking lower under the voice", () => {
    expect(Math.max(...Object.values(LEVEL))).toBeLessThanOrEqual(0.45);
    expect(MUSIC_DUCKED).toBeLessThan(MUSIC_LEVEL);
    expect(MUSIC_LEVEL).toBeLessThanOrEqual(0.3);
  });
});

describe("the typing follows a natural, irregular rhythm", () => {
  it("is not a metronome, shows every letter, and finishes inside the screen's time", () => {
    const at = fitRhythm(seededRhythm(LETTER), WRITE_TYPING_MS);
    expect(at).toHaveLength(LETTER.length);
    const gaps = at.slice(1).map((v, i) => v - at[i]!);
    expect(new Set(gaps).size).toBeGreaterThan(15);
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) * 3);
    expect(lettersAt(at, -1)).toBe(0);
    expect(lettersAt(at, at.at(-1)!)).toBe(LETTER.length);
    expect(900 + at.at(-1)!).toBeLessThan(BEATS[1]!.phoneMs); // typed, with a moment to read it, before the screen ends
    expect(BEATS[1]!.phoneMs).toBeLessThanOrEqual(STEPS[0]!.ms + 400);
  });
});

describe("the demo letter says where things are, and never shows anything secret", () => {
  const demo = readFileSync(new URL("../src/landing/Demo.tsx", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../src/landing/stories.tsx", import.meta.url), "utf8");
  it("is the agreed text, in the demo and in the final envelope scene", () => {
    expect(LETTER).toBe(
      "Dear Mia and Leo,\n\nI've put aside 2 Bitcoin for you both, my gift for your futures. The hardware wallet is in the small safe in my study, and its recovery card is sealed with Mr. Hart, our lawyer. Show him this letter and he'll help you. Split it fairly and look after each other.\n\nAll my love, Alex.",
    );
    const flat = stories.replace(/<\/text>\s*<text[^>]*>/g, " ");
    for (const part of ["I've put aside 2 Bitcoin for you", "both, my gift for your futures.", "The hardware wallet is in the small", "card is sealed with Mr. Hart, our", "he'll help you. Split it fairly", "and look after each other.", "All my love, Alex."]) expect(flat).toContain(part);
  });
  it("shows no recovery words, codes, passwords or dollar amounts", () => {
    expect(LETTER).not.toMatch(/door code|password|passcode|\bPIN\b|seed phrase|\$\s?\d|USD|dollars?|\b\d{4,}\b/i);
    expect(stories).not.toMatch(/door code|password|passcode|\bPIN\b/i);
  });
});

describe("the illustrated scenes", () => {
  const ids = ["desk", "chairs", "shield", "calendar", "seal", "horizon", "clock", "open"] as StoryId[];
  it.each(ids)("%s draws, with thin lines, no emoji and only the four names", (id) => {
    const html = renderToStaticMarkup(<Story id={id} />);
    expect(html).toContain("<svg");
    expect(html.replace(/&#x27;/g, "'")).toContain(STORY_ALT[id]);
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html)).toBe(false);
    for (const n of [...html.matchAll(/class="nm"[^>]*>([^<]*)</g)].map((m) => m[1]).filter(Boolean)) expect(["Alex", "Mia", "Leo", "Sofia"]).toContain(n);
  });
  it("is clean: no figures, no big grey circles, no floating squares, no ripples, at most one wax-red accent per scene", () => {
    const src = readFileSync(new URL("../src/landing/stories.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/Person|Head|Scraps|lamp|gift-light|a="ring"|ripple/);
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/lamp-light|gift-light|@keyframes ring|@keyframes scrap|\.ripple/);
    for (const id of ids) {
      const html = renderToStaticMarkup(<Story id={id} />);
      const accents = (html.match(/class="(wx|wxl)"/g) ?? []).length;
      expect(accents, id).toBeLessThanOrEqual(5); // one accent object (a few strokes at most)
    }
  });
  it("the still version has no animation, and the scenes use no stroke dashes or filters", () => {
    expect(renderToStaticMarkup(<Story id="desk" still />)).toContain("still");
    expect(readFileSync(new URL("../src/landing/stories.tsx", import.meta.url), "utf8")).not.toMatch(/strokeDash|filter=|feGaussianBlur/);
  });
});

describe("remembering the choice", () => {
  const store: Record<string, string> = {};
  const fake = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
  afterEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });
  it("is asked on the first visit, then remembered", () => {
    // @ts-expect-error a tiny stand-in for the browser
    globalThis.window = { localStorage: fake };
    expect(getIntroChoice()).toBeNull();
    setIntroChoice("skip");
    expect(getIntroChoice()).toBe("skip");
    setIntroChoice("yes");
    expect(getIntroChoice()).toBe("yes");
  });
  it("does not nag when storage is blocked", () => {
    expect(getIntroChoice()).toBe("skip");
  });
});

const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|post-quantum|ciphertext|cipher|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity|tx)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const noop = () => {};

describe("the intro screens", () => {
  const html = renderToStaticMarkup(<IntroPrompt onYes={noop} onSkip={noop} />);
  it("asks the question with two buttons", () => {
    expect(html).toContain("Want to see what Tabella is about?");
    expect(html).toContain("Yes, show me");
    expect(html).toContain("Skip");
  });
  it("the player opens on the cinematic opener, with replay, pause, mute and skip, and a next arrow", () => {
    const p = renderToStaticMarkup(<IntroPlayer onClose={noop} />);
    expect(p).toContain('aria-label="Pause"');
    expect(p).toContain('aria-label="Mute"');
    expect(p).toContain('aria-label="Skip intro"');
    expect(p).toContain('aria-label="Replay"');
    expect(p).toContain('aria-label="Next scene"');
    expect(p).toContain("Some things should be said one day.");
  });
  it("every spoken line and every screen is free of technical words and emoji", () => {
    const text = [html, renderToStaticMarkup(<IntroPlayer onClose={noop} />), ...VOICE_LINES].join(" ").replace(/<[^>]+>/g, " ");
    expect(FORBIDDEN.exec(text)?.[0]).toBeUndefined();
    expect(EMOJI.exec(text)?.[0]).toBeUndefined();
  });
});

describe("the loved one's waiting screens reveal nothing", () => {
  it("sealed and on-its-way show only the calm line and no letter words (not even the demo's)", async () => {
    const { HeirStateView } = await import("../src/open/OpenPage");
    for (const state of ["sealed", "on-its-way"] as const) {
      const html = renderToStaticMarkup(<HeirStateView state={state} onOpen={() => {}} />);
      const text = html.replace(/<[^>]+>/g, " ");
      expect(text).not.toMatch(/Bitcoin|Dear Mia|wallet|recovery|study|Alex|Open your letter/);
      expect(text).toContain(state === "sealed" ? "Your letter is still safely sealed." : "Your letter is on its way.");
    }
    const ready = renderToStaticMarkup(<HeirStateView state="ready" onOpen={() => {}} />);
    expect(ready).toContain("Open your letter");
  });
});

describe("the Surprise film", () => {
  const S = SURPRISE_FILM;
  it("has the nine lines, exactly as written, and the same voice style", () => {
    expect(S.VOICE_LINES).toEqual([
      "Some things should be said one day. Tabella helps you say them.",
      "Write a letter for someone you love.",
      "Keep it a surprise. Add how to reach them, and a question only they can answer.",
      "Add someone you trust, in case they can't be reached.",
      "Choose when it should open. If you go quiet for a while.",
      "Seal it. Safe even from future super-computers.",
      "Every so often, just tap: I'm still here.",
      "And if one day you can't, Tabella finds them, by email, message or call.",
      "They answer the question only they know, and your words reach them. Sealed today. Opened when it matters.",
    ]);
    expect(S.voicePrefix).toBe("s");
    expect(S.ESTIMATED_SECONDS).toHaveLength(9);
  });
  it("lines that are the same words as the first film's reuse its recordings", () => {
    const dir = new URL("../src/assets/voice/", import.meta.url);
    for (const [s, o] of [["s01", "01"], ["s05", "05"], ["s07", "07"]] as const) {
      expect(readFileSync(new URL(`${s}.mp3`, dir)).equals(readFileSync(new URL(`${o}.mp3`, dir)))).toBe(true);
    }
    expect(S.VOICE_LINES[0]).toBe(VOICE_LINES[0]);
    expect(S.VOICE_LINES[4]).toBe(VOICE_LINES[4]);
    expect(S.VOICE_LINES[6]).toBe(VOICE_LINES[6]);
  });
  it("is the opener, nine scenes in order, and ends with the question and the envelope opening (no phone)", () => {
    expect(S.BEATS.map((b) => b.story)).toEqual([null, "desk", "reach", "backup", "calendar", "seal", "horizon", "clock", "find", "openq"]);
    expect(S.BEATS.filter((b) => b.line !== null).map((b) => b.line)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.BEATS[7]!.line).toBeNull(); // time passes: the clock, no voice
    expect(S.BEATS.at(-1)).toMatchObject({ story: "openq", noPhone: true, step: null });
    S.BEATS.forEach((b) => b.step !== null && expect(STEPS_SURPRISE[b.step]).toBeTruthy());
    S.BEATS.forEach((b, i) => i > 0 && b.step !== null && expect(b.phoneMs).toBeLessThanOrEqual(STEPS_SURPRISE[b.step!]!.ms + 400));
  });
  it("every beat fits its scene, the zoom, its screen and its line; the whole film is a calm length", () => {
    S.BEATS.forEach((b, i) => {
      if (i === 0) return;
      expect(S.beatMs(i)).toBeGreaterThanOrEqual(b.noPhone ? b.storyMs : b.storyMs + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS);
      if (b.line !== null) expect(S.VOICE_AT[i]! + S.ESTIMATED_SECONDS[b.line]! * 1000).toBeLessThan(S.beatMs(i));
    });
    expect(S.totalMs()).toBeGreaterThan(80_000);
    expect(S.totalMs()).toBeLessThan(150_000);
  });
  it("each scene has its own quiet transition at its start, all different", () => {
    const ts = S.BEATS.slice(1).map((b) => b.cues.find((c) => c.at === 0 && c.sfx.startsWith("t-"))?.sfx);
    expect(ts.every(Boolean)).toBe(true);
    expect(new Set(ts).size).toBe(ts.length);
    for (const t of ts) expect(LEVEL[t!]).toBeLessThanOrEqual(0.16);
    S.BEATS.forEach((b, i) => b.cues.forEach((c) => (expect(c.at).toBeGreaterThanOrEqual(0), expect(c.at).toBeLessThan(S.beatMs(i)))));
  });
  it("the scenes draw, with no emoji, and the new ones are in the picture list", () => {
    for (const id of ["reach", "backup", "find", "openq"] as StoryId[]) {
      const html = renderToStaticMarkup(<Story id={id} />);
      expect(html).toContain("<svg");
      expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html)).toBe(false);
      expect(html.replace(/&#x27;/g, "'")).toContain(STORY_ALT[id]);
    }
  });
});
