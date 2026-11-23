import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { Landing } from "../src/landing/Landing";
import { DoneScreen } from "../src/steps/DoneScreen";
import { GuardianStep } from "../src/steps/GuardianStep";
import { SealStep } from "../src/steps/SealStep";
import { WhenStep } from "../src/steps/WhenStep";
import { WhoStep } from "../src/steps/WhoStep";
import { WriteStep } from "../src/steps/WriteStep";
import { PeopleStep } from "../src/steps/PeopleStep";
import { emptyDraft } from "../src/lib/storage";
import { JoinPage } from "../src/join/JoinPage";
import { OpenPage } from "../src/open/OpenPage";
import type { SealedLetter } from "../src/lib/storage";

// Words people must never meet (brief section 9). "key" is allowed only inside the brief's own
// "spare house key" phrase, which is an everyday image, not a technical term.
const FORBIDDEN =
  /\b(ML-?KEM|ML-?DSA|KEM|DSA|post-quantum|ciphertext|cipher|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity|tx)\b/i;

const stripCurious = (html: string) => html.replace(/<details class="curious[\s\S]*?<\/details>/, "");
const noop = () => {};
const heirs = [
  { name: "Mia", address: "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3" },
  { name: "Leo", address: "qor14tg7fvfe3zxq9t5vte83lnrh4z0q6c64tfu5qy" },
];
const sealed: SealedLetter = {
  version: 1,
  letterId: "4",
  txHash: "0xabc",
  createdAt: "2026-11-16T00:00:00Z",
  registry: "0xC0808aF18e2283dFE4d026315a462349561fFd1c",
  heirs: heirs.map((h) => ({ name: h.name, evm: h.address, qor: "qor1x" })),
  guardianName: "Sofia",
  whenLabel: "6 months",
  quietSeconds: 1,
  warningSeconds: 1,
  ownerCard: "tbl1_OWNERCODE",
  guardianCard: "tbl1_GUARDIANCODE",
};
// (the sample letter itself must not contain the words: only the app's own text is being checked)
const draft = { text: "Dear Mia and Leo,\nThe house papers are in the blue folder.", heirs, guardian: { name: "Sofia" }, when: "6m" as const };

const screens: [string, () => string][] = [
  ["write", () => renderToStaticMarkup(<WriteStep text="" owner="" onChange={noop} onOwner={noop} onNext={noop} />)],
  ["write, filled", () => renderToStaticMarkup(<WriteStep text={draft.text} owner="Alex" onChange={noop} onOwner={noop} onNext={noop} />)],
  ["who: keep it a surprise (the main way)", () => renderToStaticMarkup(<PeopleStep draft={emptyDraft()} owner="Alex" patch={noop} onBack={noop} onNext={noop} />)],
  ["who: invite someone (the second way)", () => renderToStaticMarkup(<PeopleStep draft={{ ...emptyDraft(), mode: "invite" }} owner="Alex" patch={noop} onBack={noop} onNext={noop} />)],
  ["who", () => renderToStaticMarkup(<WhoStep owner="Alex" heirs={heirs} onChange={noop} onBack={noop} onNext={noop} />)],
  ["guardian, added", () => renderToStaticMarkup(<GuardianStep guardian={{ name: "Sofia" }} onChange={noop} onBack={noop} onNext={noop} />)],
  ["guardian, skipped", () => renderToStaticMarkup(<GuardianStep guardian={null} onChange={noop} onBack={noop} onNext={noop} />)],
  ["when", () => renderToStaticMarkup(<WhenStep when="6m" names="Mia and Leo" demo={false} onChange={noop} onBack={noop} onNext={noop} />)],
  ["when, with the hidden demo option", () => renderToStaticMarkup(<WhenStep when="demo" names="Mia and Leo" demo onChange={noop} onBack={noop} onNext={noop} />)],
  ["seal", () => renderToStaticMarkup(<SealStep draft={draft} onBack={noop} onSealed={noop} />)],
  ["done", () => renderToStaticMarkup(<DoneScreen letter={sealed} onAnother={noop} />)],
  ["join: the invitation", () => renderToStaticMarkup(<JoinPage />)],
  ["open: the card screen", () => renderToStaticMarkup(<OpenPage />)],
  ["whole app, first screen", () => renderToStaticMarkup(<App />)],
  // the front page: its "For the curious" box is the only place technical terms may appear, so it is cut out first
  ["front page (without the For the curious box)", () => stripCurious(renderToStaticMarkup(<Landing />))],
];

describe("no technical words on screen", () => {
  it.each(screens)("%s", (_name, render) => {
    const html = render().replace(/spare house key/gi, "spare house ___").replace(/I('|&#x27;)ve put aside 2 Bitcoin[^<]*/g, "") // the demo letter is sample text the visitor is shown being written
      .replace(/\(no wallet or crypto needed\)/g, "").replace(/Ordinary wallet addresses won('|&#x27;)t work/g, ""); // the invite step says plainly that no wallet is needed (agreed wording)
    // remove the sealed card codes: they are opaque on purpose
    const text = html.replace(/tbl1_[A-Z]+/g, "").replace(/<[^>]+>/g, " ");
    // what people read or hear: text and labels. Class names and link targets are invisible, so they are left out.
    const visible = html.replace(/tbl1_[A-Z]+/g, "").replace(/\s(class|href|id|for|name|type|viewBox|d|fill|stroke\w*|r|cx|cy|x|y|font\w*|text-anchor|offset|stop\w*|style|rel|target|download|tabindex|autocomplete|autocapitalize|autocorrect|spellcheck|inputmode|role)="[^"]*"/g, "");
    const hit = FORBIDDEN.exec(visible);
    expect(hit?.[0], `found "${hit?.[0]}" in: ${text.replace(/\s+/g, " ").slice(0, 200)}`).toBeUndefined();
  });

  it("the technical terms live in the For the curious box, and only there", () => {
    const html = renderToStaticMarkup(<Landing />);
    const box = /<details class="curious[\s\S]*?<\/details>/.exec(html)?.[0] ?? "";
    for (const term of ["ML-KEM-1024", "ML-DSA-87", "On-chain checks", "The two-key split"]) {
      expect(box, term).toContain(term);
      expect(stripCurious(html), `${term} must not appear outside the box`).not.toContain(term);
    }
    expect(box).toContain("For the curious");
    expect(/<details[^>]*\sopen/.test(box)).toBe(false); // closed until someone opens it
  });

  it("the front page says what the brief says", () => {
    const html = stripCurious(renderToStaticMarkup(<Landing />));
    for (const line of ["Sealed today. Opened when it matters.", "Start here", "See how it works", "Words that never get said.", "Things locked away when no one knows where they are.", "Sealed on your device.", "Two halves.", "The Postman can&#x27;t read it.", "You stay in control.", "Built for the future.", "Honest limits", "Build Before Q-Day", "Apache-2.0"]) expect(html, line).toContain(line);
    expect(html).toContain('href="/write"');
  });

  it("says the things the brief says", () => {
    const html = renderToStaticMarkup(<DoneScreen letter={sealed} onAnother={noop} />);
    expect(html).toContain("Only Mia and Leo can open this.");
    expect(html).toContain('aria-label="Sealed."');
    expect(html).toContain("Keep this safe, like a spare house key.");
    expect(html).toContain("Your I&#x27;m-still-here card");
    expect(renderToStaticMarkup(<WriteStep text="" owner="" onChange={noop} onOwner={noop} onNext={noop} />)).toContain("What do you want them to read one day?");
    expect(renderToStaticMarkup(<WhoStep owner="Alex" heirs={heirs} onChange={noop} onBack={noop} onNext={noop} />)).toContain("Alex, who should read this one day?");
  });
});

// Mature and quiet: no emoji, sparkles or decorative symbols anywhere in the app's own text or source.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
describe("no emoji", () => {
  it.each(screens)("on screen: %s", (_name, render) => {
    expect(EMOJI.exec(render())?.[0]).toBeUndefined();
  });
  it("in the source", () => {
    const dir = (d: string) => readdirSync(new URL(`../src/${d}`, import.meta.url)).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => `${d}${f}`);
    for (const f of [...dir(""), ...dir("ui/"), ...dir("steps/"), ...dir("landing/"), ...dir("me/")]) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
      expect(EMOJI.exec(src)?.[0], f).toBeUndefined();
    }
  });
});
