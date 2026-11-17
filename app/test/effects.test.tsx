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
import { skyAtHour } from "../src/lib/sky";
import { detectQoreX, QOREX_RDNS } from "../src/lib/qorex";
import { JoinPage } from "../src/join/JoinPage";
import { SpareCardRow } from "../src/me/SpareCards";
import * as storage from "../src/lib/storage";
import { stuckLabel } from "../src/me/StuckLetter";
import { REGISTRY, REGISTRIES, PAST_REGISTRIES, isCurrentRegistry } from "../src/lib/config";
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
    expect(html(<Notices />)).toContain('aria-label="Notices"');
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

describe("light sky and glass; dark left alone", () => {
  it("light has one main cloud and fainter small ones, each drifting 60 to 90 seconds, far slower and fainter than near", () => {
    const T = (n: string) => Number(new RegExp(`\\.lc-${n} \\{[^}]*--T: (\\d+)s`).exec(css)![1]);
    const O = (n: string) => Number(new RegExp(`\\.lc-${n} \\{[^}]*--o: ([0-9.]+)`).exec(css)![1]);
    for (const n of ["a", "b", "c", "main"]) expect(T(n)).toBeGreaterThanOrEqual(60), expect(T(n)).toBeLessThanOrEqual(90);
    expect(T("a")).toBeGreaterThan(T("main"));
    expect(T("c")).toBeGreaterThan(T("main"));
    expect(O("main")).toBeGreaterThan(O("a"));
    expect(O("main")).toBeGreaterThan(O("b"));
    const b = html(<Background />);
    expect((b.match(/class="lc lc-/g) ?? []).length).toBe(4); // a, c, b, main (the first copy of each)
    expect((b.match(/lc2/g) ?? []).length).toBe(4); // and the copy that cross-fades with it
    expect(html(<Background main={false} />)).not.toContain("lc-main");
  });
  it("the dark sky is still the three tiling layers, and light hides them (and the reverse)", () => {
    expect(css).toContain(':root[data-theme="dark"] .bgl { display: none; }');
    expect(css).toContain(':root:not([data-theme="dark"]) .bgd { display: none; }');
    expect(css).toMatch(/\.cl-drift \{[^}]*animation: cl-drift var\(--dur\) linear infinite/);
  });
  it("light glass is frosted with a thin light border and a soft shadow, and never reaches the dark glass", () => {
    const rule = /:root:not\(\[data-theme="dark"\]\) \.glass:not\(\.night \.glass\) \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain("backdrop-filter: blur(18px)");
    expect(rule).toMatch(/border: 1px solid rgba\(255, 255, 255/);
    expect(rule).toContain("box-shadow");
  });
});

describe("removing cards that have no sealed letter", () => {
  it("a spare card offers Remove from this device, and the question comes first", () => {
    const h = html(<SpareCardRow title="An opening card" line="x" onRemove={() => {}} />);
    expect(h).toContain("Remove from this device");
    expect(h).not.toContain("Remove this card from this phone?");
  });
  it("cards that belong to a sealed letter have no remove option, and no letter can be deleted", () => {
    const h = html(<CardsView letter={letter()} />);
    expect(h).not.toContain("Remove from this device");
    expect("removeLetter" in storage).toBe(false);
  });
});

describe("letters on every registry version", () => {
  it("keeps every deployed registry, with the current one first", () => {
    expect(REGISTRIES[0]!.address).toBe(REGISTRY);
    expect(PAST_REGISTRIES.map((v) => v.address)).toEqual(expect.arrayContaining(["0xC0808aF18e2283dFE4d026315a462349561fFd1c", "0x48E4e0B4957d7C8ED6ac3d38cF45A7e5fa03b78D"]));
    expect(isCurrentRegistry("0xC0808aF18e2283dFE4d026315a462349561fFd1c")).toBe(false);
    expect(isCurrentRegistry(REGISTRY.toLowerCase())).toBe(true);
  });
  it("labels plainly, and never leaves 'We couldn't look just now' as the answer", () => {
    expect(stuckLabel({ kind: "older", view: null })!.title).toBe("From an older test version");
    expect(stuckLabel({ kind: "missing" })!.title).toBe("This letter didn't finish sealing");
    expect(stuckLabel({ kind: "older", view: null })!.why).toBe("older");
    expect(stuckLabel({ kind: "missing" })!.why).toBe("unfinished");
    expect(stuckLabel({ kind: "unreachable" })!.why).toBeNull(); // no removal while we simply cannot see the network
    expect(css + html(<SpareCardRow title="x" line="y" onRemove={() => {}} />)).not.toContain("We couldn't look just now");
  });
  it("removal from the list is refused for a letter sealed on the current version", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
    const cur = letter({ letterId: "5", registry: REGISTRY });
    const old = letter({ letterId: "28", registry: "0xC0808aF18e2283dFE4d026315a462349561fFd1c" });
    const unknown = letter({ letterId: "15", registry: "" });
    for (const l of [cur, old, unknown]) storage.saveLetter(l);
    expect(storage.loadLetters().length).toBe(3);
    expect(storage.removeFromList(cur, "older")).toBe(false); // the current version is never "older"
    expect(storage.removeFromList(unknown, "older")).toBe(false); // an unknown version is not proven older
    expect(storage.removeFromList(old, "older")).toBe(true);
    expect(storage.removeFromList(unknown, "unfinished")).toBe(true); // looked up everywhere and found nowhere
    expect(storage.loadLetters().map((l) => l.letterId)).toEqual(["5"]);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
  it("the same letter number on two versions is two letters", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
    storage.saveLetter(letter({ letterId: "7", registry: REGISTRY }));
    storage.saveLetter(letter({ letterId: "7", registry: "0xC0808aF18e2283dFE4d026315a462349561fFd1c" }));
    expect(storage.loadLetters().length).toBe(2);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

describe("the light page is warm pearl, with pink only in the clouds", () => {
  const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  it("every light sky base is warm off-white: red barely above green, never a pink wash", () => {
    for (const h of [8, 10, 12, 14, 16, 18, 19.5, 20]) {
      const s = skyAtHour(h);
      for (const c of [s.top, s.bot]) {
        expect(c[0]! - c[1]!, `${h}h red minus green`).toBeLessThan(10); // pink would be 15 or more
        expect(c[0]! - c[2]!, `${h}h red minus blue`).toBeLessThan(16);
        expect(lum(c)).toBeGreaterThan(226);
      }
    }
    expect(skyAtHour(14).bot).toEqual([247, 244, 237]); // shows as about #F4F1EA with the fine grain on top
  });
  it("the glass stays neutral white, and the clouds are the only pink", () => {
    const rule = /:root:not\(\[data-theme="dark"\]\) \.glass:not\(\.night \.glass\) \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/background: rgba\(255, 255, 255, 0\.\d+\)/);
    expect(rule).not.toMatch(/rgba\((2[0-4]\d|1\d\d), (1\d\d|[0-9]{1,2}),/);
    const tint = /--cloud-tint: (\d+) (\d+) (\d+)/.exec(css)!;
    expect(Number(tint[1]) - Number(tint[3])).toBeGreaterThan(30); // a clear blush
  });
});

describe("QoreX is offered only when it is really there", () => {
  const stub = (extra: Record<string, unknown> = {}) => {
    const t = new EventTarget() as EventTarget & Record<string, unknown>;
    Object.assign(t, extra);
    (globalThis as unknown as { window: unknown }).window = t;
    return t;
  };
  const done = () => delete (globalThis as unknown as { window?: unknown }).window;
  const announce = (t: EventTarget, rdns: string, provider: unknown) => t.addEventListener("eip6963:requestProvider", () => t.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { rdns }, provider } })));
  it("finds nothing when no wallet is there (the usual case), and says so quietly", async () => {
    stub();
    expect(await detectQoreX(60)).toBe(false);
    done();
  });
  it("finds window.qorex.native", async () => {
    stub({ qorex: { native: { enable: () => {} } } });
    expect(await detectQoreX(60)).toBe(true);
    done();
  });
  it("finds an EIP-6963 announcement from network.qore.qorex, and ignores other wallets", async () => {
    const t = stub();
    announce(t, "io.other.wallet", { native: { enable: () => {} } });
    expect(await detectQoreX(60)).toBe(false);
    announce(t, QOREX_RDNS, { native: { enable: () => {} } });
    expect(await detectQoreX(60)).toBe(true);
    done();
  });
  it("never touches window.ethereum", () => {
    const src = readFileSync(new URL("../src/lib/qorex.ts", import.meta.url), "utf8");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/window\.ethereum|defineProperty/);
  });
  it("/join shows the no-wallet path, and no 'Use QoreX instead' until a wallet is found", () => {
    const h = html(<JoinPage />);
    expect(h).not.toContain("Use QoreX instead");
  });
});

