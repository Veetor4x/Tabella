import { IconClock, IconLetter } from "./icons";
import { ChoiceCard } from "./ChoiceCard";
import { Field } from "./Field";
import { REMINDER_LINE_MAX, REMINDER_SUBJECT_MAX, reminderProblem } from "../lib/reminders";
import type { Reminders } from "../lib/storage";

/**
 * "Remind me to check in": an optional email and how its reminders should look. Shown on the "When should it open?" step, under
 * "If I go quiet" (never for a letter that opens on a date). The email is sealed to the Postman like every other address.
 */
export function ReminderFields({ value, onChange }: { value: Reminders; onChange: (r: Reminders) => void }) {
  const set = (p: Partial<Reminders>) => onChange({ ...value, ...p });
  const problem = value.email.trim() ? reminderProblem(value) : null;
  const emailBad = value.email.trim() !== "" && problem === "That email address doesn't look right.";
  return (
    <section className="reminders glass" aria-label="Reminders to check in">
      <label htmlFor="reminder-email">Your email, for reminders (optional)</label>
      <Field>
        <input id="reminder-email" type="email" inputMode="email" autoComplete="email" value={value.email} placeholder="you@example.com" aria-invalid={emailBad || undefined} aria-describedby="reminder-help" onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <p className="hint small" id="reminder-help">
        If the countdown starts, we'll email you a few gentle reminders with one link to tap "I'm still here". These emails never say anything about your letter.
      </p>

      <div className="reminder-style" role="radiogroup" aria-label="How should reminders look?">
        <p className="reminder-q">How should reminders look?</p>
        <div className="choices">
          <ChoiceCard name="reminder-style" checked={value.style === "simple"} onChange={() => set({ style: "simple" })} icon={<IconClock />} title="Simple check-in" sub={`"A quick check-in from Tabella". It's been a while. Tap here to let us know you're still around.`} />
          <ChoiceCard name="reminder-style" checked={value.style === "personal"} onChange={() => set({ style: "personal" })} icon={<IconLetter />} title="Personal note" sub="Write a short subject and line of your own, like “Water the plants”. We add the link at the end." />
        </div>
      </div>

      {value.style === "personal" && (
        <div className="reminder-personal">
          <label htmlFor="reminder-subject">Subject</label>
          <Field>
            <input id="reminder-subject" type="text" maxLength={REMINDER_SUBJECT_MAX} value={value.subject} placeholder="Water the plants" onChange={(e) => set({ subject: e.target.value })} />
          </Field>
          <label htmlFor="reminder-line">Your line</label>
          <Field>
            <input id="reminder-line" type="text" maxLength={REMINDER_LINE_MAX} value={value.line} placeholder="A quick tap, then back to your day." onChange={(e) => set({ line: e.target.value })} />
          </Field>
          <p className="hint small">Keep it to you: please don't mention the letter or who it's for.</p>
        </div>
      )}
      {problem && (
        <p className="status-line" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
