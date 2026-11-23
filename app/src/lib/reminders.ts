import { REMINDER_LINE_MAX, REMINDER_SUBJECT_MAX, type OwnerReminders } from "../../../shared/surprise";
import type { Reminders } from "./storage";

const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,24}$/;
export const isReminderEmail = (s: string) => EMAIL.test(s.trim());
export { REMINDER_LINE_MAX, REMINDER_SUBJECT_MAX };

/** A short, kind sentence for the first thing wrong with the reminder settings, or null when they are fine (an empty email is fine: no reminders). */
export function reminderProblem(r: Reminders | undefined): string | null {
  if (!r || !r.email.trim()) return null;
  if (!isReminderEmail(r.email)) return "That email address doesn't look right.";
  if (r.style === "personal" && (!r.subject.trim() || !r.line.trim())) return "Add a short subject and a line, or choose the simple check-in.";
  return null;
}

/** What goes to the Postman (sealed with the letter), or undefined when the owner asked for no reminders. Never for a letter that opens on a date. */
export function ownerReminders(r: Reminders | undefined, dated: boolean): OwnerReminders | undefined {
  if (dated || !r || !isReminderEmail(r.email) || reminderProblem(r)) return undefined;
  const one = (s: string, max: number) => s.replace(/[\r\n\t<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return r.style === "personal"
    ? { email: r.email.trim(), style: "personal", subject: one(r.subject, REMINDER_SUBJECT_MAX), line: one(r.line, REMINDER_LINE_MAX) }
    : { email: r.email.trim(), style: "simple" };
}
