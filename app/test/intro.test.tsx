import { readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { getIntroChoice, setIntroChoice } from "../src/lib/intro";
import { IntroPlayer, IntroPrompt } from "../src/landing/Intro";
import { Story, STORY_ALT, type StoryId } from "../src/landing/stories";
import { readFileSync } from "node:fs";
import { BEATS, ESTIMATED_SECONDS, OPENER_MS, STORY_MS, VOICE_AT, VOICE_LINES, ZOOM_MS, ZOOM_OUT_MS, beatMs, cuesBetween, phaseAt, sentenceStarts, sentences, totalMs } from "../src/landing/introScript";
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
    expect(starts[2]).toBeLessThan(6000);
  });
  it("recordings are named 01.mp3 to 08.mp3 and the browser's own voice is never used", () => {
    const files = readdirSync(new URL("../src/assets/voice/", import.meta.url)).filter((f) => f.endsWith(".mp3"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^0[1-8]\.mp3$/);
    for (const f of ["../src/landing/Intro.tsx", "../src/landing/voice.ts", "../src/landing/sfx.ts"]) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/);
  });
});

describe("the film: opener, then a story scene, a zoom and a screen for each step", () => {
  it("has the opener and eight beats, each demo screen preceded by its own illustrated scene", () => {
    expect(BEATS).toHaveLength(9);
    expect(BEATS.map((b) => b.story)).toEqual([null, "desk", "family", "thumbs", "calendar", "seal", "beach", "race", "gift"]);
    expect(BEATS.map((b) => b.step)).toEqual([null, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(BEATS.filter((b) => b.line !== null).map((b) => b.line)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(BEATS[7]!.line).toBeNull(); // time passes: music, ticks and the race, no voice
  });
  it("every beat is long enough for its story, the zoom, its screen and its line", () => {
    BEATS.forEach((b, i) => {
      if (i === 0) return expect(beatMs(0)).toBeGreaterThanOrEqual(OPENER_MS);
      expect(beatMs(i)).toBeGreaterThanOrEqual(STORY_MS + ZOOM_MS + b.phoneMs + ZOOM_OUT_MS);
      if (b.line !== null) expect(beatMs(i, 40)).toBeGreaterThan(40_000); // a long recording stretches the beat, never cuts it off
    });
    expect(STORY_MS).toBeGreaterThanOrEqual(2000);
    expect(STORY_MS).toBeLessThanOrEqual(3200); // "a 2 to 3 second scene"
    expect(totalMs()).toBeGreaterThan(70_000);
    expect(totalMs()).toBeLessThan(130_000);
  });
  it("the screen plays no longer than the demo screen's own schedule", () => {
    BEATS.forEach((b) => b.step !== null && expect(b.phoneMs).toBeLessThanOrEqual(STEPS[b.step]!.ms + 400));
  });
  it("the camera goes story, zoom in, phone, zoom out", () => {
    const last = beatMs(1);
    expect(phaseAt(1, 500).phase).toBe("story");
    expect(phaseAt(1, STORY_MS + 100).phase).toBe("zoom-in");
    expect(phaseAt(1, STORY_MS + ZOOM_MS + 500)).toEqual({ phase: "phone", screenT: 500 });
    expect(phaseAt(1, last - 100).phase).toBe("zoom-out");
  });
  it("the voice starts inside its beat and the line fits before the beat ends", () => {
    BEATS.forEach((b, i) => b.line !== null && i > 0 && expect(VOICE_AT[i]! + ESTIMATED_SECONDS[b.line]! * 1000).toBeLessThan(beatMs(i)));
  });
});

describe("sound effects and music", () => {
  it("every cue names an effect that exists as a file, inside its beat, in time order within reason", () => {
    const names = new Set(readdirSync(new URL("../src/assets/sfx/", import.meta.url)).map((f) => f.replace(".wav", "")));
    BEATS.forEach((b, i) => {
      for (const c of b.cues) {
        expect(names.has(c.sfx), c.sfx).toBe(true);
        expect(c.at).toBeGreaterThanOrEqual(0);
        expect(c.at).toBeLessThan(beatMs(i));
      }
    });
  });
  it("covers what the brief asks: typing, rustle and fold, whoosh, pop, wax stamp, clock ticks, a chime when the letter opens", () => {
    const all = new Set(BEATS.flatMap((b) => b.cues.map((c) => c.sfx)));
    for (const n of ["type", "rustle", "fold", "whoosh", "pop", "stamp", "tick", "chime"]) expect(all.has(n as never), n).toBe(true);
    expect(BEATS[1]!.cues.filter((c) => c.sfx === "type").length).toBeGreaterThan(20); // typing while the letter is written
    expect(BEATS[7]!.cues.filter((c) => c.sfx === "tick").length).toBeGreaterThan(10);
    expect(BEATS[8]!.cues.some((c) => c.sfx === "chime")).toBe(true);
    expect(BEATS[5]!.cues.some((c) => c.sfx === "stamp")).toBe(true);
  });
  it("a window of time returns exactly the cues inside it", () => {
    expect(cuesBetween(2, 0, 2000).map((c) => c.sfx)).toEqual(["pop", "whoosh", "pop"]);
    expect(cuesBetween(2, 500, 600)).toHaveLength(1);
    expect(cuesBetween(2, 600, 700)).toHaveLength(0);
  });
  it("is soft: no effect is louder than 0.6 of full, the bed is quiet and ducks lower under the voice", async () => {
    const src = readFileSync(new URL("../src/landing/sfx.ts", import.meta.url), "utf8");
    const levels = [...src.matchAll(/(\w+): ([0-9.]+)[,}]/g)].map((m) => +m[2]!).filter((n) => n > 0 && n <= 1);
    expect(Math.max(...levels)).toBeLessThanOrEqual(0.6);
    const { MUSIC_LEVEL, MUSIC_DUCKED } = await import("../src/landing/sfx");
    expect(MUSIC_DUCKED).toBeLessThan(MUSIC_LEVEL);
    expect(MUSIC_LEVEL).toBeLessThanOrEqual(0.3);
  });
});

describe("the illustrated scenes", () => {
  const ids = ["desk", "family", "thumbs", "calendar", "seal", "beach", "race", "gift"] as StoryId[];
  it.each(ids)("%s draws, with only the four characters and no emoji", (id) => {
    const html = renderToStaticMarkup(<Story id={id} />);
    expect(html).toContain("<svg");
    expect(html.replace(/&#x27;/g, "'")).toContain(STORY_ALT[id]);
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html)).toBe(false);
    const names = [...html.matchAll(/class="nm"[^>]*>([^<]*)</g)].map((m) => m[1]).filter(Boolean);
    for (const n of names) expect(["Alex", "Mia", "Leo", "Sofia"]).toContain(n);
  });
  it("the still version has no animation, and no scene lines stroke dashes or filters", () => {
    expect(renderToStaticMarkup(<Story id="desk" still />)).toContain("still");
    const src = readFileSync(new URL("../src/landing/stories.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/strokeDash|filter=|feGaussianBlur/);
  });
  it("only the four characters appear across all the scenes", () => {
    const all = ids.map((id) => renderToStaticMarkup(<Story id={id} />)).join(" ");
    for (const n of ["Alex", "Mia", "Leo", "Sofia"]) expect(all).toContain(n);
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
