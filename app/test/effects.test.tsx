import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyMotion, domAnimation } from "framer-motion";
import { Headline } from "../src/ui/Headline";
import { DecodedText } from "../src/ui/Decode";
import { Signature, signerOf } from "../src/ui/Signature";
import { PenLine } from "../src/ui/PenLine";
import { ThemeToggle } from "../src/ui/ThemeToggle";
import { Faq } from "../src/landing/Faq";
import { Perch } from "../src/landing/Perch";
import { Background } from "../src/ui/Background";
import { Trust } from "../src/landing/Trust";

const html = (el: JSX.Element) => renderToStaticMarkup(<LazyMotion features={domAnimation}>{el}</LazyMotion>);

describe("the new effects", () => {
  it("a headline reads as one sentence, each word with a soft copy and a sharp one", () => {
    const h = html(<Headline text="Sealed today. Opened when it *matters*." />);
    expect(h).toContain('aria-label="Sealed today. Opened when it matters."');
    expect((h.match(/hw-b/g) ?? []).length).toBe(6);
    expect(h).toContain("it");
  });
  it("a decoding letter keeps its real words in the page, and no soft marks for anyone who cannot see the effect", () => {
    const h = html(<DecodedText text={"Dear Mia,\n\nLook after each other.\nAlex"} />);
    expect(h.replace(/<span class="dw-sym"[^>]*>.*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("Dear Mia,Look after each other.Alex");
    expect(h).toContain('aria-hidden="true"');
    expect(h).not.toContain("settled");
  });
  it("finds who signed a letter", () => {
    expect(signerOf("Dear Mia,\n\nAll my love, Alex.")).toBe("Alex");
    expect(signerOf("See you soon.\nAlex")).toBe("Alex");
    expect(signerOf("it is in the blue folder.")).toBeNull();
    expect(html(<Signature name="Alex" />)).toContain('aria-label="Signed, Alex"');
  });
  it("the pen line is labelled for screen readers", () => {
    expect(html(<PenLine label="Sealing" />)).toContain('aria-label="Sealing"');
  });
  it("the theme toggle offers Auto, Day and Night, and Auto is the default", () => {
    const h = html(<ThemeToggle />);
    expect(h).toContain('role="radiogroup"');
    expect(h).toMatch(/aria-label="Auto"[^>]*|aria-checked="true"[^>]*aria-label="Auto"/);
    for (const w of ["Auto", "Day", "Night"]) expect(h).toContain(`aria-label="${w}"`);
    expect((h.match(/aria-checked="true"/g) ?? []).length).toBe(1);
  });
  it("the FAQ has its five questions, all folded at first", () => {
    const h = html(<Faq />);
    for (const q of ["Can it be opened early?", "Can Tabella read my letter?", "What if I'm just away?", "What if they lose their card?", "What happens to my email and phone number?"]) expect(h.replace(/&#x27;/g, "'")).toContain(q);
    expect((h.match(/aria-expanded="false"/g) ?? []).length).toBe(5);
    expect(h).not.toContain("class=\"faq-a\"");
  });
  it("the trust section marks its key phrases", () => {
    const h = html(<Trust />);
    expect((h.match(/class="hl"/g) ?? []).length).toBe(6);
    expect(h).not.toContain("{{");
  });
  it("the background is three layers of pre-rendered clouds, and the perch is a labelled picture", () => {
    const b = html(<Background />);
    for (const d of ["far", "mid", "near"]) expect(b).toContain(`cl-${d}`);
    expect(b).toContain('aria-hidden="true"');
    expect(html(<Perch />)).toContain("A sealed letter resting on a soft cloud");
  });
});
