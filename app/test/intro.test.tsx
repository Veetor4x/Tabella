import { readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { getIntroChoice, setIntroChoice } from "../src/lib/intro";
import { IntroPlayer, IntroPrompt } from "../src/landing/Intro";
import { ESTIMATED_SECONDS, OPENER_MS, SCENES, VOICE_AT, VOICE_LINES, sceneMs, sentenceStarts, sentences, stepAt } from "../src/landing/introScript";

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
  it("has one scene per line, the opener first and the last scene showing two screens", () => {
    expect(SCENES.map((s) => s.line)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(SCENES[0]!.steps).toEqual([]);
    expect(SCENES[7]!.steps).toEqual([6, 7]);
    expect(SCENES[1]!.steps).toEqual([0]); // write
    expect(SCENES[6]!.steps).toEqual([5]); // I'm still here
  });
  it("the opener is about five seconds, the whole film about a minute", () => {
    expect(sceneMs(0)).toBeGreaterThanOrEqual(OPENER_MS);
    expect(sceneMs(0)).toBeLessThan(6200);
    const total = SCENES.reduce((n, _, i) => n + sceneMs(i), 0);
    expect(total).toBeGreaterThan(45_000);
    expect(total).toBeLessThan(90_000);
  });
  it("a scene always lasts long enough for its line to be said and a breath after it", () => {
    SCENES.forEach((sc, i) => {
      const secs = ESTIMATED_SECONDS[sc.line]!;
      expect(sceneMs(i, secs)).toBeGreaterThanOrEqual(VOICE_AT[i]! + secs * 1000);
      expect(sceneMs(i, 30)).toBeGreaterThan(30_000); // a long recording stretches the scene, never cuts it off
    });
  });
  it("the last scene moves from time passing to the letter opening", () => {
    expect(stepAt(7, 1000)).toEqual({ step: 6, t: 1000 });
    expect(stepAt(7, 8000)!.step).toBe(7);
    expect(stepAt(0, 500)).toBeNull();
  });
  it("captions follow the voice a sentence at a time", () => {
    expect(sentences(VOICE_LINES[0])).toEqual(["Some things should be said one day.", "Tabella helps you say them."]);
    expect(sentences(VOICE_LINES[7])).toHaveLength(3);
    const starts = sentenceStarts(VOICE_LINES[7], 6);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(starts[0]!);
    expect(starts[2]).toBeGreaterThan(starts[1]!);
    expect(starts[2]).toBeLessThan(6000);
  });
  it("recordings, where they exist, are named 01.mp3 to 08.mp3 (a missing one just plays silently with its caption)", () => {
    const files = readdirSync(new URL("../src/assets/voice/", import.meta.url)).filter((f) => f.endsWith(".mp3"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^0[1-8]\.mp3$/);
  });
  it("never uses the browser's own voice", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["../src/landing/Intro.tsx", "../src/landing/voice.ts"]) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/);
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
  it("the player opens on the cinematic opener, with mute, pause and skip", () => {
    const p = renderToStaticMarkup(<IntroPlayer onClose={noop} />);
    expect(p).toContain('aria-label="Pause"');
    expect(p).toContain('aria-label="Mute"');
    expect(p).toContain('aria-label="Skip intro"');
    expect(p).toContain("Some things should be said one day.");
  });
  it("every spoken line and every screen is free of technical words and emoji", () => {
    const text = [html, renderToStaticMarkup(<IntroPlayer onClose={noop} />), ...VOICE_LINES].join(" ").replace(/<[^>]+>/g, " ");
    expect(FORBIDDEN.exec(text)?.[0]).toBeUndefined();
    expect(EMOJI.exec(text)?.[0]).toBeUndefined();
  });
});
