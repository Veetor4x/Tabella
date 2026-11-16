import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cardDecode, cardEncode, keyHash, newSeed, signingKeysFromSeed } from "../../shared/tabella-crypto";
import { friendlyError, HelperError } from "../src/lib/helper";
import type { LetterView } from "../src/lib/registry";
import { countdown, ringText, span } from "../src/lib/time";
import type { SealedLetter } from "../src/lib/storage";
import { CardsPage, CardsView } from "../src/me/CardsPage";
import { GuardianPage, GuardianView } from "../src/me/GuardianPage";
import { MePage } from "../src/me/MePage";
import { CheckInView, nextLine } from "../src/me/parts";
import { RestorePanel } from "../src/me/Restore";
import { Ring } from "../src/ui/Ring";

const NOW = 1_800_000_000_000;
const view = (o: Partial<LetterView> = {}): LetterView => ({
  id: 7n, state: "Sealed", lastCheckIn: 1_800_000_000 - 100, quiet: 90 * 86400, warning: 14 * 86400, nonce: 1, pausesUsed: 0, hasGuardian: true,
  heirs: ["0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3", "0x1111111111111111111111111111111111111111"], ownerKeyHash: "0x01", guardianKeyHash: "0x02", chainNow: 1_800_000_000, fetchedAt: NOW, ...o,
});
const noop = () => {};

describe("countdown and wording", () => {
  it("says days, hours, minutes in plain words", () => {
    expect(span(28 * 86400)).toBe("28 days");
    expect(span(26 * 3600)).toBe("1 day 2 hours");
    expect(span(5 * 3600)).toBe("5 hours");
    expect(span(80)).toBe("1 minute 20 seconds");
    expect(span(45)).toBe("45 seconds");
    expect(span(1)).toBe("1 second");
  });
  it("Next check-in in 28 days", () => {
    const v = view({ lastCheckIn: 1_800_000_000 - 62 * 86400 });
    expect(nextLine(v, NOW)).toBe("Next check-in in 28 days");
  });
  it("moves from quiet to warning to over, and the ring follows", () => {
    const v = view({ quiet: 120, warning: 60, lastCheckIn: 1_800_000_000 });
    expect(countdown(v, NOW).phase).toBe("quiet");
    expect(countdown(v, NOW + 130_000)).toMatchObject({ phase: "warning" });
    expect(countdown(v, NOW + 200_000)).toMatchObject({ phase: "over", fraction: 0 });
    expect(countdown(v, NOW).fraction).toBeCloseTo(1, 1);
    expect(ringText(view({ state: "Cancelled" }), countdown(view(), NOW)).big).toBe("Cancelled");
  });
  it("friendly messages for the new refusals", () => {
    expect(friendlyError(new HelperError("would_revert", "PauseLimitReached"))).toMatch(/Both pauses/);
    expect(friendlyError(new HelperError("would_revert", "NotOpen"))).toMatch(/already opened or been cancelled/);
    expect(friendlyError(new HelperError("wrong_card"))).toMatch(/doesn't belong/);
  });
});

describe("cards and QR codes", () => {
  it("a card code survives being drawn as a QR code and scanned back", () => {
    const code = cardEncode(newSeed());
    const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    const n = qr.modules.size, scale = 6, quiet = 4, side = (n + quiet * 2) * scale;
    const px = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 20; }
    const read = jsQR(px, side, side);
    expect(read?.data).toBe(code);
    expect(() => cardDecode(read!.data)).not.toThrow();
  });
  it("the same card always has the same fingerprint (how letters are found again)", () => {
    const seed = newSeed();
    expect(keyHash(signingKeysFromSeed(seed).publicKey)).toBe(keyHash(signingKeysFromSeed(cardDecode(cardEncode(seed))).publicKey));
  });
  it("the ring turns by transform only", () => {
    expect(readFileSync(new URL("../src/ui/Ring.tsx", import.meta.url), "utf8")).not.toMatch(/strokeDash|stroke-dash/);
  });
});

// Words people must never meet. "key" only inside the brief's own "spare house key".
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|post-quantum|ciphertext|cipher|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity|tx|relay\w*)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const saved: SealedLetter = {
  version: 1, letterId: "7", ownerName: "Alex", txHash: "0xabc", createdAt: "2026-11-16T00:00:00Z", registry: "0xC0", heirs: [{ name: "Mia", evm: "0xE6", qor: "q" }, { name: "Leo", evm: "0x11", qor: "q" }],
  guardianName: "Sofia", whenLabel: "6 months", quietSeconds: 1, warningSeconds: 1, ownerCard: cardEncode(new Uint8Array(32).fill(1)), guardianCard: cardEncode(new Uint8Array(32).fill(2)),
};
const screens: [string, () => string][] = [
  ["my letters", () => renderToStaticMarkup(<MePage />)],
  ["check-in, sealed", () => renderToStaticMarkup(<CheckInView view={view()} now={NOW} ownerName="Alex" phase="idle" onTap={noop} />)],
  ["check-in, working", () => renderToStaticMarkup(<CheckInView view={view()} now={NOW} ownerName="Alex" phase="working" onTap={noop} />)],
  ["check-in, thanks", () => renderToStaticMarkup(<CheckInView view={view()} now={NOW} ownerName="Alex" phase="done" onTap={noop} />)],
  ["check-in, warning (urgent)", () => renderToStaticMarkup(<CheckInView view={view({ state: "Warning", quiet: 60, warning: 3 * 86400, lastCheckIn: 1_800_000_000 - 90 })} now={NOW} ownerName="Alex" phase="idle" onTap={noop} />)],
  ["check-in, opened", () => renderToStaticMarkup(<CheckInView view={view({ state: "Opened" })} now={NOW} phase="idle" onTap={noop} />)],
  ["check-in, cancelled", () => renderToStaticMarkup(<CheckInView view={view({ state: "Cancelled" })} now={NOW} phase="idle" onTap={noop} />)],
  ["check-in, with an error", () => renderToStaticMarkup(<CheckInView view={view()} now={NOW} phase="idle" error={friendlyError(new HelperError("rate_limited"))} onTap={noop} />)],
  ["restore (owner)", () => renderToStaticMarkup(<RestorePanel role="owner" onDone={noop} />)],
  ["restore (guardian)", () => renderToStaticMarkup(<RestorePanel role="guardian" onDone={noop} />)],
  ["guardian page", () => renderToStaticMarkup(<GuardianPage />)],
  ["guardian, two pauses left", () => renderToStaticMarkup(<GuardianView view={view()} now={NOW} busy={false} thanks={false} onTap={noop} />)],
  ["guardian, thanks, one left", () => renderToStaticMarkup(<GuardianView view={view({ pausesUsed: 1 })} now={NOW} name="Sofia" busy={false} thanks onTap={noop} />)],
  ["guardian, none left", () => renderToStaticMarkup(<GuardianView view={view({ pausesUsed: 2 })} now={NOW} busy={false} thanks={false} onTap={noop} />)],
  ["guardian, refused", () => renderToStaticMarkup(<GuardianView view={view({ pausesUsed: 2 })} now={NOW} busy={false} thanks={false} error={friendlyError(new HelperError("would_revert", "PauseLimitReached"))} onTap={noop} />)],
  ["cards", () => renderToStaticMarkup(<CardsView letter={saved} />)],
  ["cards, none found", () => renderToStaticMarkup(<CardsPage />)],
];
const visibleText = (html: string) =>
  html.replace(/spare house key/gi, "spare house ___").replace(/tbl1_[A-Za-z0-9_-]+/g, "").replace(/<path[^>]*>/g, "").replace(/\s(class|href|id|for|name|type|viewBox|d|fill|stroke\w*|r|cx|cy|x|y|width|height|rx|font\w*|text-anchor|offset|stop\w*|style|rel|target|download|tabindex|autocomplete|autocapitalize|autocorrect|spellcheck|inputmode|role|shape-rendering|data-\w+|aria-describedby|aria-labelledby|aria-live|aria-current)="[^"]*"/g, "");

describe("the owner and guardian screens", () => {
  it.each(screens)("no technical words and no emoji: %s", (_n, render) => {
    const html = render();
    const hit = FORBIDDEN.exec(visibleText(html));
    expect(hit?.[0], `found "${hit?.[0]}"`).toBeUndefined();
    expect(EMOJI.exec(html)?.[0]).toBeUndefined();
  });
  it("says what the brief says", () => {
    const thanks = renderToStaticMarkup(<CheckInView view={view()} now={NOW} ownerName="Alex" phase="done" onTap={noop} />);
    expect(thanks).toContain("Thanks, Alex.");
    expect(thanks).toContain("Your letter stays sealed.");
    expect(renderToStaticMarkup(<CheckInView view={view()} now={NOW} phase="idle" onTap={noop} />)).toContain("I&#x27;m still here");
    const g = renderToStaticMarkup(<GuardianView view={view({ pausesUsed: 1 })} now={NOW} busy={false} thanks={false} onTap={noop} />);
    expect(g).toContain("They&#x27;re okay");
    expect(g).toContain("1 of 2");
    const cards = renderToStaticMarkup(<CardsView letter={saved} />);
    expect(cards).toContain("Keep this safe, like a spare house key.");
    expect(cards).toContain("Guardian card for Sofia");
    expect(cards).toContain("<svg");
    expect(renderToStaticMarkup(<Ring fraction={0.5} size={100} />)).toContain("ring-half");
  });
  it("a guardian cannot tap with no pauses left", () => {
    expect(renderToStaticMarkup(<GuardianView view={view({ pausesUsed: 2 })} now={NOW} busy={false} thanks={false} onTap={noop} />)).toMatch(/<button[^>]*disabled/);
  });
  it("Cancel is a two-step thing: the page has a confirm panel with Keep it and Yes, cancel it", () => {
    const src = readFileSync(new URL("../src/me/MePage.tsx", import.meta.url), "utf8");
    expect(src).toContain("Cancel this letter");
    expect(src).toContain("Yes, cancel it");
    expect(src).toContain("Keep it");
  });
});
