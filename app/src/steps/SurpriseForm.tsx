import { AnimatePresence, m } from "framer-motion";
import { MAX_BACKUPS } from "../../../shared/surprise";
import { personProblem } from "../lib/sealSurprise";
import { emptyPerson, type SurprisePerson } from "../lib/storage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { IconPlus } from "../ui/icons";
import { cardAppear } from "../ui/motion";

export function PersonFields(props: { id: string; kind: "recipient" | "backup"; p: SurprisePerson; onChange: (p: SurprisePerson) => void; heading: string; onRemove?: () => void; showProblem: boolean }) {
  const { id, p, kind } = props;
  const set = (patch: Partial<SurprisePerson>) => props.onChange({ ...p, ...patch });
  const problem = props.showProblem ? personProblem(p, kind) : null;
  return (
    <section className="surprise-person glass" aria-label={props.heading}>
      <h3>{props.heading}</h3>
      <label htmlFor={`${id}-name`}>First name</label>
      <Field>
        <input id={`${id}-name`} type="text" value={p.name} placeholder={kind === "recipient" ? "Mia" : "Sofia"} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />
      </Field>
      {kind === "backup" && (
        <>
          <label htmlFor={`${id}-rel`}>Who are they to {kind === "backup" ? "the person you're writing to" : ""}?</label>
          <Field>
            <input id={`${id}-rel`} type="text" value={p.relation ?? ""} placeholder="Her sister" autoComplete="off" onChange={(e) => set({ relation: e.target.value })} />
          </Field>
        </>
      )}
      <label htmlFor={`${id}-email`}>Email</label>
      <Field>
        <input id={`${id}-email`} type="email" inputMode="email" value={p.email} placeholder="name@example.com" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <label htmlFor={`${id}-phone`}>Phone, with country code (optional)</label>
      <Field>
        <input id={`${id}-phone`} type="tel" inputMode="tel" value={p.phone} placeholder="+44 7700 900123" autoComplete="off" onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <p className="hint small">Text and call reminders coming soon.</p>
      <label htmlFor={`${id}-q`}>A private question only {p.name.trim() || "they"} could answer</label>
      <Field>
        <input id={`${id}-q`} type="text" value={p.question} placeholder="What did we call the boat?" autoComplete="off" onChange={(e) => set({ question: e.target.value })} />
      </Field>
      <label htmlFor={`${id}-a`}>The answer</label>
      <Field>
        <input id={`${id}-a`} type="text" value={p.answer} placeholder="The answer" autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set({ answer: e.target.value })} />
      </Field>
      <p className="hint small">Pick something only {p.name.trim() || "they"} would know, not something online.</p>
      {problem && (
        <p className="status-line" role="status">
          {problem}
        </p>
      )}
      {props.onRemove && (
        <button type="button" className="link" onClick={props.onRemove}>
          Remove {p.name.trim() || "this person"}
        </button>
      )}
    </section>
  );
}

/** "Keep it a surprise": how to reach the person, a question only they can answer, and up to three backup people. */
export function SurpriseForm(props: { recipient: SurprisePerson; backups: SurprisePerson[]; onChange: (r: SurprisePerson, b: SurprisePerson[]) => void; showProblems: boolean }) {
  const { recipient, backups } = props;
  return (
    <div className="surprise-form">
      <PersonFields id="r" kind="recipient" p={recipient} heading="Who is it for?" onChange={(r) => props.onChange(r, backups)} showProblem={props.showProblems} />
      <AnimatePresence initial={false}>
        {backups.map((b, i) => (
          <m.div key={i} {...cardAppear}>
            <PersonFields id={`b${i}`} kind="backup" p={b} heading={`Backup person ${i + 1}`} onChange={(nb) => props.onChange(recipient, backups.map((x, j) => (j === i ? nb : x)))} onRemove={() => props.onChange(recipient, backups.filter((_, j) => j !== i))} showProblem={props.showProblems} />
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
