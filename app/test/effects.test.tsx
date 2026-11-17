import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { FlipDays } from "../src/ui/FlipDays";
import { CopyButton } from "../src/ui/CopyButton";
import { Notices } from "../src/ui/Notices";
import { OpenEnvelope } from "../src/ui/OpenEnvelope";
import { HoldSeal } from "../src/ui/HoldSeal";
import { ThemeToggle } from "../src/ui/ThemeToggle";
import { Faq } from "../src/landing/Faq";
import { Background } from "../src/ui/Background";
import { CardDoor } from "../src/me/CardDoor";
import { CardPage } from "../src/me/CardPage";
import { HowTo } from "../src/me/HowTo";
import { PrintCard, CardsView } from "../src/me/CardsPage";
import { deliveryLine } from "../src/me/MePage";
import { extractCode } from "../src/lib/cards";
import { notify, getToasts, dismiss } from "../src/lib/notices";
import { APP_HOST, CARD_URL } from "../src/lib/config";
import { Landing } from "../src/landing/Landing";
import type { SealedLetter } from "../src/lib/storage";

const html = (el: JSX.Element) => renderToStaticMarkup(<LazyMotion features={domAnimation}>{el}</LazyMotion>);
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const letter = (o: Partial<SealedLetter> = {}): SealedLetter => ({ version: 1, letterId: "7", txHash: "", createdAt: "", registry: "", heirs: [{ name: "Mia", evm: "0x1", qor: "" }], guardianName: "Sofia", whenLabel: "", quietSeconds: 1, warningSeconds: 1, ownerCard: "tbl1_owner", guardianCard: "tbl1_guard", ...o });

describe("only the effects that were asked for are left", () => {
  it("has none of the removed ones", () => {
    for (const gone of ["fx-shine", "data-fx", ".hw-b", ".dw-sym", "seal-breathe", ".sig-name", ".penline", ".hl::before", "faq-unfold", "refill-halo", ".perch"]) expect(css, gone).not.toContain(gone);
  });
  it("the FAQ answers open and close plainly, and one is about found cards", () => {
    const h = html(<Faq />).replace(/&#x27;/g, "'");
    expect((h.match(/aria-expanded="false"/g) ?? []).length).toBe(6);
    expect(h).toContain("I found or received a Tabella card. What do I do?");
    expect(h).not.toContain('class="faq-a"');
  });
  it("flip-clock digits: one card per digit", () => {
    expect((html(<FlipDays value="128" />).match(/class="fd"/g) ?? []).length).toBe(3);
  });
  it("a copy button says Copy and turns into Copied", () => {
    const h = html(<CopyButton text="x" label="Copy code" />);
    expect(h).toContain("Copy code");
    expect(h).toContain("Copied");
  });
  it("notices stack: newest first, and dismiss", () => {
    const a = notify("Thanks, Alex. Your letter stays sealed.", 60_000);
    const b = notify("Sofia paused the timer. You have more time.", 60_000);
    expect(getToasts().map((t) => t.id)).toEqual([b, a]);
    expect(html(<Notices />)).toContain('role="status"');
    dismiss(a);
    dismiss(b);
    expect(getToasts()).toEqual([]);
  });
  it("the envelope on /open has a flap, a letter and a seal", () => {
    const h = html(<OpenEnvelope lines={["Dear Mia,", "I love you."]} />);
    for (const c of ["oe-flap-out", "oe-flap-in", "oe-letter", "oe-seal"]) expect(h).toContain(c);
    expect(css).toContain("perspective: 900px");
  });
  it("press and hold to seal has a tap alternative", () => {
    const h = html(<HoldSeal onSeal={() => {}} busy={false} />);
    expect(h).toContain("Press and hold to seal");
    expect(h).toContain("Seal it now with one tap");
  });
  it("links underline in wax-red by a transform", () => {
    expect(css).toMatch(/\.link::after[^{]*\{[^}]*scaleX\(0\)/);
  });
  it("the theme toggle offers Auto, Day and Night", () => {
    const h = html(<ThemeToggle />);
    for (const w of ["Auto", "Day", "Night"]) expect(h).toContain(`aria-label="${w}"`);
  });
  it("the sky is three drifting layers, far slower than near, and the front page leaves out the near one", () => {
    const b = html(<Background />);
    for (const d of ["far", "mid", "near"]) expect(b).toContain(`cl-${d}`);
    expect(html(<Background main={false} />)).not.toContain("cl-near");
    const secs = (n: string) => Number(new RegExp(`\\.cl-${n} \\{ --dur: (\\d+)s`).exec(css)![1]);
    expect(secs("far")).toBeGreaterThan(secs("mid"));
    expect(secs("mid")).toBeGreaterThan(secs("near"));
    for (const n of ["far", "mid", "near"]) expect(secs(n)).toBeGreaterThanOrEqual(60), expect(secs(n)).toBeLessThanOrEqual(90);
  });
});

describe("one door for all cards", () => {
  it("reads the code out of a scanned address, a pasted line or the bare code", () => {
    expect(extractCode(`${CARD_URL}#tbl1_abc-DEF_123`)).toBe("tbl1_abc-DEF_123");
    expect(extractCode("  tbl1_abc \n DEF ")).toBe("tbl1_abcDEF");
  });
  it("/card has the three friendly tiles above the paste box, and Scan QR", () => {
    const h = html(<CardPage />).replace(/&#x27;/g, "'");
    const tiles = h.indexOf("I wrote a letter");
    expect(tiles).toBeGreaterThan(0);
    expect(tiles).toBeLessThan(h.indexOf("Paste your card's code"));
    expect(h).toContain("Someone asked me to look after their letter");
    expect(h).toContain("Someone left me a letter");
    expect(h).toContain("Scan QR");
    expect(html(<CardDoor />)).toContain('aria-pressed="false"');
  });
  it("the how-to is three captioned steps", () => {
    for (const k of ["owner", "guardian", "opening"] as const) {
      const h = html(<HowTo kind={k} onClose={() => {}} />);
      expect(h).toContain("Step 1 of 3");
    }
  });
  it("every printed card shows the address under the QR, and three plain steps on the back", () => {
    const h = html(<PrintCard kind="owner" title="I'm-still-here card" line="x" use="Use this on /card if you change phones." code="tbl1_x" letterId="7" />).replace(/&#x27;/g, "'");
    expect(h).toContain(`${APP_HOST}/card`);
    expect(h).toContain("Use this on /card if you change phones.");
    expect(h).toContain("Scan this code or type it in");
    expect(h).toContain("Follow the screen");
    expect(h).toContain(`Go to ${APP_HOST}/card`);
  });
  it("every card screen says in one line what it is for", () => {
    const h = html(<CardsView letter={letter()} />).replace(/&#x27;/g, "'");
    expect(h).toContain("Use this on /card if you change phones.");
    expect(h).toContain("Give this to Sofia. Sofia uses it on /card.");
  });
  it("the front page has the header button, the quiet link, the footer links and the menu", () => {
    const h = html(<Landing />);
    expect(h).toContain("I have a card");
    expect(h).toContain("Already have a card?");
    expect(h).toContain("Use it here.");
    for (const f of ["Use your card", "My letters", "Guardian"]) expect(h).toContain(f);
    expect(h).toContain("Menu");
  });
  it("/me says how each letter will be delivered", () => {
    expect(deliveryLine(letter({ surprise: { backups: 1, emailed: true } }))).toBe("Delivery ready: we'll email Mia when it opens");
    expect(deliveryLine(letter({ surprise: { backups: 0, emailed: false } }))).toBe("Add an email so we can reach them");
  });
});
