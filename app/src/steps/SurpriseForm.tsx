import { AnimatePresence, m } from "framer-motion";
import { MAX_BACKUPS } from "../../../shared/surprise";
import { isEmail, isPhone, personProblem } from "../lib/sealSurprise";
import { emptyPerson, type SurprisePerson } from "../lib/storage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { IconPlus } from "../ui/icons";
import { cardAppear } from "../ui/motion";
import { Req, type Problem } from "../ui/problems";
import { SpamNote } from "../ui/TestingNote"; // TESTING-NOTE

export function PersonFields(props: { id: string; kind: "recipient" | "backup"; p: SurprisePerson; onChange: (p: SurprisePerson) => void; heading: string; onRemove?: () => void; showProblem?: boolean; /** TESTING-NOTE: the real form says emails may land in Spam; the demo phone on the front page does not */ testingNote?: boolean }) {
  const { id, p, kind } = props;
  const set = (patch: Partial<SurprisePerson>) => props.onChange({ ...p, ...patch });
  return (
    <section className="surprise-person glass" aria-label={props.heading}>
      <h3>{props.heading}</h3>
      <label htmlFor={`${id}-name`}>
        First name
        <Req />
      </label>
      <Field id={`${id}-name`}>
        <input id={`${id}-name`} type="text" value={p.name} placeholder={kind === "recipient" ? "Mia" : "Sofia"} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />
      </Field>
      {kind === "backup" && (
        <>
          <label htmlFor={`${id}-rel`}>
            Who are they to you?
            <Req />
          </label>
          <Field id={`${id}-rel`}>
            <input id={`${id}-rel`} type="text" value={p.relation ?? ""} placeholder="My sister" autoComplete="off" onChange={(e) => set({ relation: e.target.value })} />
          </Field>
        </>
      )}
      <label htmlFor={`${id}-email`}>
        Email
        <Req />
      </label>
      <Field id={`${id}-email`}>
        <input id={`${id}-email`} type="email" inputMode="email" value={p.email} placeholder="name@example.com" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      {props.testingNote && <SpamNote /> /* TESTING-NOTE */}
      <label htmlFor={`${id}-phone`}>Phone, with country code (optional)</label>
      <Field id={`${id}-phone`}>
        <input id={`${id}-phone`} type="tel" inputMode="tel" value={p.phone} placeholder="+44 7700 900123" autoComplete="off" onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <p className="hint small">Text and call reminders coming soon.</p>
      <label htmlFor={`${id}-q`}>
        A private question only {p.name.trim() || "they"} could answer
        <Req />
      </label>
      <Field id={`${id}-q`}>
        <input id={`${id}-q`} type="text" value={p.question} placeholder="What did we name the cat that kept stealing your socks?" autoComplete="off" onChange={(e) => set({ question: e.target.value })} />
      </Field>
      <p className="hint small">Ask about something only the two of you share.</p>
      <label htmlFor={`${id}-a`}>
        The answer
        <Req />
      </label>
      <Field id={`${id}-a`}>
        <input id={`${id}-a`} type="text" value={p.answer} placeholder="The answer" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set({ answer: e.target.value })} />
      </Field>
      <p className="hint small">Pick something only {p.name.trim() || "they"} would know, not something online.</p>
      {props.onRemove && (
        <button type="button" className="link" onClick={props.onRemove}>
          Remove {p.name.trim() || "this person"}
        </button>
      )}
    </section>
  );
}

/** "Keep it a surprise": how to reach the person, a question only they can answer, and up to three backup people. */
export function SurpriseForm(props: { recipient: SurprisePerson; backups: SurprisePerson[]; onChange: (r: SurprisePerson, b: SurprisePerson[]) => void; showProblems?: boolean }) {
  const { recipient, backups } = props;
  return (
    <div className="surprise-form">
      <PersonFields id="r" kind="recipient" p={recipient} heading="Who is it for?" onChange={(r) => props.onChange(r, backups)} testingNote /* TESTING-NOTE */ />
      <AnimatePresence initial={false}>
        {backups.map((b, i) => (
          <m.div key={i} {...cardAppear}>
            <PersonFields id={`b${i}`} kind="backup" p={b} heading={`Backup person ${i + 1}`} onChange={(nb) => props.onChange(recipient, backups.map((x, j) => (j === i ? nb : x)))} onRemove={() => props.onChange(recipient, backups.filter((_, j) => j !== i))} testingNote /* TESTING-NOTE */ showProblem={props.showProblems} />
          </m.div>
        ))}
      </AnimatePresence>
      {backups.length < MAX_BACKUPS && (
        <Button variant="glass" onClick={() => props.onChange(recipient, [...backups, emptyPerson()])}>
          <span className="inline-icon">
            <IconPlus size={16} /> {backups.length ? "Add another backup person" : "Add someone you trust, in case they can't be reached"}
          </span>
        </Button>
      )}
      <aside className="honest glass" aria-label="How this works">
        <p>
          <strong>The answers are the only lock on delivery,</strong> so choose private ones.
        </p>
        <p>Delivery depends on our service running.</p>
        <p>Contact details are stored privately, for delivery only: only our Postman can read them. For now we reach people by email.</p>
      </aside>
    </div>
  );
}

export const surpriseReady = (r: SurprisePerson, b: SurprisePerson[]) => !personProblem(r, "recipient") && b.every((x) => !personProblem(x, "backup"));

/** Everything missing or wrong about one person, field by field, in the order the fields are on the page. */
export function personProblems(p: SurprisePerson, kind: "recipient" | "backup", id: string): Problem[] {
  const out: Problem[] = [];
  if (!p.name.trim()) out.push({ id: `${id}-name`, message: "Add a first name." });
  if (kind === "backup" && !(p.relation ?? "").trim()) out.push({ id: `${id}-rel`, message: "Say who they are to you (a sister, an old friend...)." });
  if (!p.email.trim()) out.push({ id: `${id}-email`, message: "Add an email address like name@example.com" });
  else if (!isEmail(p.email)) out.push({ id: `${id}-email`, message: "That email address doesn't look right. It should be like name@example.com" });
  if (p.phone.trim() && !isPhone(p.phone)) out.push({ id: `${id}-phone`, message: "A phone number needs its country code, like +44 7700 900123, or leave it empty." });
  if (p.question.trim().length < 8) out.push({ id: `${id}-q`, message: "Write a question only they could answer (at least a few words)." });
  if (p.answer.trim().length < 3) out.push({ id: `${id}-a`, message: "Add the answer to your question (at least 3 letters)." });
  return out;
}
/** The whole "keep it a surprise" form: the recipient, then each backup. */
export const surpriseProblems = (r: SurprisePerson, b: SurprisePerson[]): Problem[] => [...personProblems(r, "recipient", "r"), ...b.flatMap((x, i) => personProblems(x, "backup", `b${i}`))];
