import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bytesToHex, type Hex } from "viem";
import { parseRelayRequest } from "../../helper/src/validate";
import { MAX_DATED_AHEAD_SECONDS, createDatedPayloadHash, newSeed, signingKeysFromSeed } from "../../shared/tabella-crypto";
import { DATED_DEMO_SECONDS, MAX_DATED_SECONDS, fromNow, isoDay, longDay, maxDay, minDay, releaseAtFor } from "../src/lib/periods";
import { buildDatedBody } from "../src/lib/seal";
import { countdown, ringText } from "../src/lib/time";
import type { LetterView } from "../src/lib/registry";
import { CheckInView, nextLine } from "../src/me/parts";
import { WhenStep, whenReady } from "../src/steps/WhenStep";

const noop = () => {};
const DAY = 86400;

describe("picking a day", () => {
  const now = new Date(2026, 10, 17, 14, 30); // 17 Nov 2026, afternoon
  it("offers tomorrow as the first day and fifty years less a day as the last", () => {
    expect(minDay(now)).toBe("2026-11-18");
    expect(maxDay(now)).toBe("2076-11-16");
    expect(MAX_DATED_SECONDS).toBe(18_263 * DAY); // 50 calendar years, leap days included
  });
  it("turns a day into the start of that day, in the person's own time zone", () => {
    const at = releaseAtFor("2031-06-14", now)!;
    expect(new Date(at * 1000).getFullYear()).toBe(2031);
    expect(new Date(at * 1000).getHours()).toBe(0);
    expect(isoDay(new Date(at * 1000))).toBe("2031-06-14");
  });
  it("refuses today, the past, nonsense, days that do not exist, and anything beyond fifty years", () => {
    expect(releaseAtFor("2026-11-17", now)).toBeNull(); // today has already begun
    expect(releaseAtFor("2025-01-01", now)).toBeNull();
    expect(releaseAtFor("2026-11-18", now)).not.toBeNull(); // tomorrow is fine
    for (const bad of ["", "tomorrow", "2031-6-14", "2031-02-31", "2031-13-01", "2077-01-01"]) expect(releaseAtFor(bad, now), bad).toBeNull();
    expect(releaseAtFor(maxDay(now), now)).not.toBeNull();
    // the picker's own limits always satisfy the contract's (<= 50 years)
    expect(releaseAtFor(maxDay(now), now)! - Math.floor(now.getTime() / 1000)).toBeLessThanOrEqual(MAX_DATED_AHEAD_SECONDS);
  });
  it("says it kindly", () => {
    const at = releaseAtFor("2031-06-14", now)!;
    expect(longDay(at, "en-GB")).toMatch(/^Saturday,? 14 June 2031$/);
    expect(fromNow(at, Math.floor(now.getTime() / 1000))).toMatch(/about 4 years, 7 months/);
    const nowS = Math.floor(now.getTime() / 1000); // always pass "now": without it fromNow reads the real clock and the test drifts a day every day
    expect(fromNow(nowS + 86400, nowS)).toBe("tomorrow");
    expect(fromNow(nowS + 20 * 86400, nowS)).toBe("in 20 days");
    expect(DATED_DEMO_SECONDS).toBe(120);
  });
});

describe("the two ways to decide when it opens", () => {
  const base = { onMode: noop, when: "6m" as const, onDay: noop, onDateDemo: noop, names: "Mia", demo: false, onChange: noop, onBack: noop, onNext: noop };
  it('"If I go quiet" is the default and shows 3 / 6 / 12 months and no demo option', () => {
    const html = renderToStaticMarkup(<WhenStep {...base} mode="quiet" />);
    expect(html).toContain("When should it");
    expect(html).toContain("If I go quiet");
    expect(html).toContain("On a date");
    for (const l of ["3 months", "6 months", "12 months"]) expect(html).toContain(l);
    expect(html).not.toContain("2 minutes (demo)");
    expect(html).not.toContain('type="date"');
  });
  it('"On a date" shows a calm date picker limited to tomorrow up to 50 years ahead, and hides the quiet-time choices', () => {
    const html = renderToStaticMarkup(<WhenStep {...base} mode="date" />);
    expect(html).toContain('type="date"');
    expect(html).toContain(`min="${minDay()}"`);
    expect(html).toContain(`max="${maxDay()}"`);
    expect(html).not.toContain("3 months");
    expect(html).toContain("whether or not you check in");
    expect(html).toContain("no guardian is needed");
    expect(html).not.toContain("2 minutes (demo)"); // only with the demo timer
  });
  it("with the demo timer, both ways offer their 2-minute demo", () => {
    expect(renderToStaticMarkup(<WhenStep {...base} mode="quiet" demo />)).toContain("2 minutes (demo)");
    const dated = renderToStaticMarkup(<WhenStep {...base} mode="date" demo />);
    expect(dated).toContain("In 2 minutes (demo)");
  });
  it("can go on only with a real day (or the demo)", () => {
    expect(whenReady("quiet", undefined, false)).toBe(true);
    expect(whenReady("date", undefined, false)).toBe(false);
    expect(whenReady("date", "1999-01-01", false)).toBe(false);
    expect(whenReady("date", minDay(), false)).toBe(true);
    expect(whenReady("date", undefined, true)).toBe(true);
  });
});

describe("a dated letter in the app", () => {
  const letter = (over: Partial<LetterView> = {}): LetterView => ({
    id: 5n, state: "Sealed", lastCheckIn: 1_000_000, quiet: 0, warning: 0, nonce: 1, releaseAt: 1_000_000 + 100 * DAY, pausesUsed: 0, hasGuardian: false, released: false, heirs: ["0x1"], ownerKeyHash: "0x01", guardianKeyHash: `0x${"00".repeat(32)}`, chainNow: 1_000_000 + 25 * DAY, fetchedAt: 0, ...over,
  });
  it("counts down in one stretch to its day, with no warning time", () => {
    const l = letter();
    const c = countdown(l, 0);
    expect(c.phase).toBe("quiet");
    expect(c.fraction).toBeCloseTo(0.75, 2);
    expect(c.left).toBe(75 * DAY);
    expect(ringText(l, c)).toEqual({ big: "75 days", small: "until it opens" });
    expect(countdown(letter({ chainNow: 1_000_000 + 100 * DAY }), 0).phase).toBe("over");
  });
  it("its check-in screen has no button to tap and says it opens on its day", () => {
    const html = renderToStaticMarkup(<CheckInView view={letter()} now={0} phase="idle" onTap={noop} />);
    expect(html).not.toContain("I&#x27;m still here");
    expect(html).not.toContain("big-tap");
    expect(html).toContain("Nothing to do.");
    expect(html).toContain("whether or not you check in");
    expect(nextLine(letter(), 0)).toMatch(/^Opens on .* 1970\.$/);
  });
  it("an ordinary letter still has its button", () => {
    const html = renderToStaticMarkup(<CheckInView view={letter({ releaseAt: 0, quiet: 180 * DAY, warning: 14 * DAY })} now={0} phase="idle" onTap={noop} />);
    expect(html).toContain("big-tap");
  });
});

describe("the request the app sends for a dated letter", () => {
  it("is accepted by the helper's validator, carries the date as a string, and has no guardian or quiet time", () => {
    const seed = newSeed();
    const body = buildDatedBody({
      heirs: ["0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3" as Hex],
      releaseAt: 1_900_000_000,
      letterCiphertext: new Uint8Array(40).fill(1),
      partAEnvelope: new Uint8Array(300).fill(2),
      partBForPostman: new Uint8Array(300).fill(3),
      ownerPublicKey: signingKeysFromSeed(seed).publicKey,
      sig: new Uint8Array(4627).fill(4),
    });
    expect(body.fn).toBe("createDatedLetter");
    expect(body.args.releaseAt).toBe("1900000000");
    expect(Object.keys(body.args).sort()).toEqual(["heirs", "letterCiphertext", "partAEnvelope", "partBForPostman", "releaseAt"]);
    const parsed = parseRelayRequest(body);
    expect(parsed.ok).toBe(true);
  });
  it("its payload hash depends on the date", () => {
    const parts = { heirs: ["0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3" as Hex], letterCiphertext: new Uint8Array(3), partAEnvelope: new Uint8Array(3), partBForPostman: new Uint8Array(3) };
    expect(createDatedPayloadHash({ ...parts, releaseAt: 1 })).not.toBe(createDatedPayloadHash({ ...parts, releaseAt: 2 }));
    void bytesToHex;
  });
});
