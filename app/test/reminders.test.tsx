import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAX_QUIET_SECONDS, defaultTestQuiet, testDuration, testLabel, testQuietSeconds, testWarningSeconds } from "../src/lib/periods";
import { ownerReminders, reminderProblem } from "../src/lib/reminders";
import { clearDraft, emptyDraft, emptyReminders, loadDraft, saveDraft } from "../src/lib/storage";
import { WhenStep } from "../src/steps/WhenStep";
import { TestBanner, TestTag } from "../src/ui/TestBanner";

const noop = () => {};
const base = { onMode: noop, when: "6m" as const, onDay: noop, onDateDemo: noop, names: "Mia", demo: false, onChange: noop, onBack: noop, onNext: noop };

describe("owner reminders on the 'When should it open?' step", () => {
  const withReminders = { ...base, reminders: emptyReminders(), onReminders: noop };
  it("sit directly under 'If I go quiet', before 'On a date'", () => {
    const html = renderToStaticMarkup(<WhenStep {...withReminders} mode="quiet" />);
    const quiet = html.indexOf("If I go quiet");
    const fields = html.indexOf("Your email, for reminders (optional)");
    const date = html.indexOf("On a date");
    expect(quiet).toBeGreaterThan(-1);
    expect(fields).toBeGreaterThan(quiet);
    expect(date).toBeGreaterThan(fields);
    expect(html).toContain("How should reminders look?");
    expect(html).toContain("Simple check-in");
    expect(html).toContain("Personal note");
    expect(html).toContain("A quick check-in from Tabella");
  });
  it("simple check-in is the default: no subject or line boxes until 'Personal note' is chosen", () => {
    const simple = renderToStaticMarkup(<WhenStep {...withReminders} mode="quiet" />);
    expect(simple).not.toContain('id="reminder-subject"');
    const personal = renderToStaticMarkup(<WhenStep {...withReminders} reminders={{ ...emptyReminders(), style: "personal" }} mode="quiet" />);
    expect(personal).toContain('id="reminder-subject"');
    expect(personal).toContain('id="reminder-line"');
    expect(personal).toContain("don&#x27;t mention the letter");
  });
  it("are not shown for a letter that opens on a date", () => {
    const html = renderToStaticMarkup(<WhenStep {...withReminders} mode="date" />);
    expect(html).not.toContain("reminders");
    expect(html).not.toContain("Simple check-in");
  });
  it("the page is exactly as before when no reminder settings are given", () => {
    const html = renderToStaticMarkup(<WhenStep {...base} mode="quiet" />);
    expect(html).not.toContain("reminder");
    for (const l of ["3 months", "6 months", "12 months"]) expect(html).toContain(l);
  });
});

describe("reminder settings", () => {
  it("an empty email is fine (no reminders); a bad one, or an empty personal note, is not", () => {
    expect(reminderProblem(emptyReminders())).toBeNull();
    expect(reminderProblem(undefined)).toBeNull();
    expect(reminderProblem({ ...emptyReminders(), email: "nope" })).toMatch(/email/);
    expect(reminderProblem({ ...emptyReminders(), email: "a@b.co", style: "personal" })).toMatch(/subject/);
    expect(reminderProblem({ ...emptyReminders(), email: "a@b.co", style: "personal", subject: "Hi", line: "Tap" })).toBeNull();
    expect(reminderProblem({ ...emptyReminders(), email: "a@b.co" })).toBeNull();
  });
  it("what is sealed for the Postman: the simple style carries no words; the personal style one clean line each", () => {
    expect(ownerReminders({ ...emptyReminders(), email: " a@b.co " }, false)).toEqual({ email: "a@b.co", style: "simple" });
    expect(ownerReminders({ email: "a@b.co", style: "personal", subject: "Water\nthe <b>plants", line: "  Tap,  then go. " }, false)).toEqual({ email: "a@b.co", style: "personal", subject: "Water the b plants", line: "Tap, then go." });
  });
  it("nothing is sealed without an email, with a problem, or for a letter that opens on a date", () => {
    expect(ownerReminders(emptyReminders(), false)).toBeUndefined();
    expect(ownerReminders({ ...emptyReminders(), email: "a@b.co" }, true)).toBeUndefined();
    expect(ownerReminders({ ...emptyReminders(), email: "bad" }, false)).toBeUndefined();
    expect(ownerReminders({ ...emptyReminders(), email: "a@b.co", style: "personal" }, false)).toBeUndefined();
  });
});

describe("test mode: a custom quiet time", () => {
  const q = (n: string, unit: "minutes" | "hours" | "days") => testQuietSeconds({ n, unit });
  it("minutes, hours or days, as a whole number of at least one", () => {
    expect(q("2", "minutes")).toBe(120);
    expect(q("3", "hours")).toBe(10_800);
    expect(q("2", "days")).toBe(172_800);
    expect(q("0", "minutes")).toBeNull();
    expect(q("", "minutes")).toBeNull();
    expect(q("1.5", "hours")).toBeNull();
    expect(q("abc", "days")).toBeNull();
    expect(q("3651", "days")).toBeNull(); // beyond what the contract accepts
    expect(q("3650", "days")).toBe(MAX_QUIET_SECONDS);
    expect(testQuietSeconds(undefined)).toBeNull();
    expect(testQuietSeconds(defaultTestQuiet())).toBe(120);
  });
  it("the warning is half the quiet time, never under a minute", () => {
    expect(testWarningSeconds(120)).toBe(60);
    expect(testWarningSeconds(60)).toBe(60); // half would be 30 s
    expect(testWarningSeconds(600)).toBe(300);
    expect(testWarningSeconds(86_400)).toBe(43_200);
  });
  it("names the time kindly", () => {
    expect(testDuration(60)).toBe("1 minute");
    expect(testDuration(120)).toBe("2 minutes");
    expect(testDuration(7200)).toBe("2 hours");
    expect(testDuration(172_800)).toBe("2 days");
    expect(testLabel(120)).toBe("2 minutes (test)");
  });
  it("replaces the 3 / 6 / 12 month choices with a Custom field (minutes, hours, days)", () => {
    const html = renderToStaticMarkup(<WhenStep {...base} mode="quiet" test testQuiet={{ n: "2", unit: "minutes" }} onTestQuiet={noop} />);
    expect(html).toContain('id="test-quiet-n"');
    for (const u of ["minutes", "hours", "days"]) expect(html).toContain(`>${u}<`);
    expect(html).not.toContain("3 months");
    expect(html).toContain("Quiet for 2 minutes, then a 1 minute countdown");
  });
  it("a test draft is kept apart from a real one", () => {
    // these tests run in plain Node: give the storage code a tiny in-memory localStorage
    const mem = new Map<string, string>();
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };
    const real = { ...emptyDraft(), text: "real letter" };
    saveDraft(real);
    saveDraft({ ...emptyDraft(), text: "test letter", test: true }, true);
    expect(loadDraft()?.text).toBe("real letter");
    expect(loadDraft(true)?.text).toBe("test letter");
    clearDraft(true);
    expect(loadDraft(true)).toBeUndefined();
    expect(loadDraft()?.text).toBe("real letter");
    clearDraft();
    delete (globalThis as { window?: unknown }).window;
  });
  it("the banner and the label say it clearly", () => {
    expect(renderToStaticMarkup(<TestBanner />)).toContain("TEST MODE");
    expect(renderToStaticMarkup(<TestBanner />)).toContain("for trying Tabella quickly");
    expect(renderToStaticMarkup(<TestTag />)).toContain("Test");
  });
});
