import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Landing } from "../src/landing/Landing";
import { emptyPerson, emptyReminders, type SealedLetter } from "../src/lib/storage";
import { DoneScreen } from "../src/steps/DoneScreen";
import { SurpriseForm } from "../src/steps/SurpriseForm";
import { ReminderFields } from "../src/ui/ReminderFields";

const FIELD = "While Tabella is in testing, our emails may land in Spam or Junk. Please check there.";
const SEALED = "Heads up: while Tabella is in testing, emails to you and the people you chose may land in Spam or Junk. Tell them to check there.";
const count = (html: string, s: string) => html.split(s).length - 1;
const letter: SealedLetter = { version: 1, letterId: "5", txHash: "0x", createdAt: "", registry: "0x", heirs: [{ name: "Mia", evm: "0x", qor: "q" }], guardianName: null, whenLabel: "2 minutes (test)", quietSeconds: 120, warningSeconds: 60, ownerCard: "c", guardianCard: null, surprise: { backups: 1, emailed: true } };

describe("the testing notes (temporary)", () => {
  it("sit under the recipient's and each backup's email field", () => {
    const html = renderToStaticMarkup(<SurpriseForm recipient={emptyPerson()} backups={[emptyPerson(), emptyPerson()]} onChange={() => {}} />);
    expect(count(html, FIELD)).toBe(3);
    const note = html.indexOf(FIELD);
    expect(html.lastIndexOf("name@example.com", note)).toBeGreaterThan(html.lastIndexOf("First name", note)); // after the email box...
    expect(html.indexOf("Phone, with country code", note)).toBeGreaterThan(note); // ...and before the phone
  });
  it("sit under 'Your email, for reminders'", () => {
    const html = renderToStaticMarkup(<ReminderFields value={emptyReminders()} onChange={() => {}} />);
    expect(count(html, FIELD)).toBe(1);
    expect(html.indexOf(FIELD)).toBeGreaterThan(html.indexOf("Your email, for reminders"));
  });
  it("is on the screen right after sealing", () => {
    expect(count(renderToStaticMarkup(<DoneScreen letter={letter} onAnother={() => {}} />), SEALED)).toBe(1);
  });
  it("is not in the front-page demo phone (which only pictures the form)", () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).not.toContain("may land in Spam");
  });
  it("is easy to remove: one file, and every use is marked TESTING-NOTE", () => {
    const uses = ["../src/steps/SurpriseForm.tsx", "../src/ui/ReminderFields.tsx", "../src/steps/DoneScreen.tsx"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));
    for (const src of uses) expect(src).toMatch(/TESTING-NOTE/);
    expect(renderToStaticMarkup(<ReminderFields value={emptyReminders()} onChange={() => {}} />)).toContain('data-testing-note="field"');
  });
});
