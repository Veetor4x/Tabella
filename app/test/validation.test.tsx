import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Landing } from "../src/landing/Landing";
import { emptyPerson } from "../src/lib/storage";
import { GuardianStep } from "../src/steps/GuardianStep";
import { personProblems, surpriseProblems } from "../src/steps/SurpriseForm";
import { WhoStep } from "../src/steps/WhoStep";
import { WriteStep } from "../src/steps/WriteStep";
import { Field } from "../src/ui/Field";
import { ProblemsProvider, Req } from "../src/ui/problems";

const noop = () => {};

describe("invite someone: name first, then the invite, then the address", () => {
  const html = renderToStaticMarkup(<WhoStep owner="Alex" heirs={[{ name: "", address: "" }]} onChange={noop} onBack={noop} onNext={noop} />);
  it("is in that order", () => {
    const name = html.indexOf("Their name");
    const invite = html.indexOf("Invite someone");
    const address = html.indexOf("Their address (from their invite)");
    expect(name).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(name);
    expect(address).toBeGreaterThan(invite);
  });
  it("says what to do and that a plain wallet address will not work", () => {
    expect(html).toContain("Don&#x27;t have their address? Send them this link. They&#x27;ll make an opening card in a minute (no wallet or crypto needed) and send you back an address starting with qor1.");
    expect(html).toContain("Ordinary wallet addresses won&#x27;t work: it needs the opening card from the invite.");
  });
  it("marks the required fields with a red star, and Continue stays tappable", () => {
    expect((html.match(/class="req"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>\s*<span>Continue/);
  });
});

describe("what to fix, field by field", () => {
  it("the surprise form names each missing or wrong field in plain words", () => {
    const all = personProblems(emptyPerson(), "recipient", "r");
    expect(all.map((p) => p.id)).toEqual(["r-name", "r-email", "r-q", "r-a"]);
    expect(all.find((p) => p.id === "r-email")?.message).toBe("Add an email address like name@example.com");
    expect(personProblems({ ...emptyPerson(), name: "Mia", email: "mia@", question: "What was the cat called?", answer: "Biscuit" }, "recipient", "r").map((p) => p.id)).toEqual(["r-email"]);
    expect(personProblems({ ...emptyPerson(), name: "Mia", email: "mia@example.com", phone: "0770", question: "What was the cat called?", answer: "Biscuit" }, "recipient", "r").map((p) => p.id)).toEqual(["r-phone"]);
    expect(personProblems({ ...emptyPerson(), name: "S", email: "s@example.com", question: "What street did we grow up on?", answer: "Maple" }, "backup", "b0").map((p) => p.id)).toEqual(["b0-rel"]);
  });
  it("a complete person has nothing to fix", () => {
    const ok = { ...emptyPerson(), name: "Mia", email: "mia@example.com", question: "What was the cat called?", answer: "Biscuit" };
    expect(surpriseProblems(ok, [])).toEqual([]);
    expect(surpriseProblems(ok, [{ ...ok, relation: "sister" }]).length).toBe(0);
  });
  it("a field with a problem turns red and says what to fix right under it", () => {
    const html = renderToStaticMarkup(
      <ProblemsProvider problems={[{ id: "x", message: "This address should start with qor1 or 0x." }]}>
        <Field id="x">
          <input id="x" />
        </Field>
        <Field id="y">
          <input id="y" />
        </Field>
      </ProblemsProvider>,
    );
    expect(html).toContain('class="field invalid"');
    expect(html).toContain('<p class="field-problem" id="x-problem" role="alert">This address should start with qor1 or 0x.</p>');
    expect((html.match(/field-problem/g) ?? []).length).toBe(1); // the other field is fine
  });
  it("the red star is hidden from screen readers, who hear 'required'", () => {
    const html = renderToStaticMarkup(<Req />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("(required)");
  });
});

describe("steps with something required keep Continue tappable", () => {
  it("the letter step (empty letter) and the guardian step (no name)", () => {
    const write = renderToStaticMarkup(<WriteStep text="" owner="" onChange={noop} onOwner={noop} onNext={noop} />);
    expect(write).not.toMatch(/<button[^>]*disabled[^>]*><span>Continue/);
    expect(write).toContain('class="req corner"');
    const guardian = renderToStaticMarkup(<GuardianStep guardian={{ name: "" }} onChange={noop} onBack={noop} onNext={noop} />);
    expect(guardian).not.toMatch(/<button[^>]*disabled[^>]*><span>Continue/);
    expect(guardian).toContain("Their name");
  });
});

describe("front page", () => {
  it("has the one calm line above the headline", () => {
    const html = renderToStaticMarkup(<Landing />);
    const note = "Leave a letter for your family: what to say, and where things are, for when you&#x27;re no longer there.";
    expect(html).toContain(note);
    expect(html.indexOf(note)).toBeLessThan(html.indexOf("Sealed today."));
  });
});
