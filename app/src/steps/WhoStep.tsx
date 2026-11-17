import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractAddress, parseAddress } from "../lib/addr";
import { isReady } from "../lib/seal";
import type { Person } from "../lib/storage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { inviteLink } from "../lib/share";
import { IconCheck, IconPlus } from "../ui/icons";
import { SharePanel } from "../ui/SharePanel";
import { cardAppear, fadeTransition, ghostLayer, sharpLayer } from "../ui/motion";
import { StepFrame } from "../ui/StepFrame";

/** 0xE6EB…6Ca3: enough to recognise an address. */
const short = (evm: string) => `${evm.slice(0, 6)}…${evm.slice(-4)}`;

export type Readiness = "empty" | "invalid" | "checking" | "ready" | "notready" | "error";

const MAX_PEOPLE = 3;

/** Looks the person up as they type and says whether a letter can be sealed for them yet. */
export function useReadiness(address: string): Readiness {
  const parsed = useMemo(() => parseAddress(address), [address]);
  const qor = parsed.ok ? parsed.qor : "";
  const [state, setState] = useState<Readiness>("empty");

  useEffect(() => {
    if (!address.trim()) return setState("empty");
    if (!qor) return setState("invalid");
    setState("checking");
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const ok = await isReady(qor);
        if (!stale) setState(ok ? "ready" : "notready");
      } catch {
        if (!stale) setState("error");
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [address, qor]);

  return state;
}

const MESSAGE: Partial<Record<Readiness, string>> = {
  invalid: "That doesn't look like an address. It starts with qor1 or 0x.",
  notready: "They haven't set up their opening card yet. Once they have, this turns to Ready and you can continue.",
  error: "We couldn't check just now. Please try again in a moment.",
};

function Badge({ state }: { state: Readiness }) {
  if (state === "ready")
    return (
      <span className="badge ready">
        Ready <IconCheck size={15} />
      </span>
    );
  if (state === "notready") return <span className="badge not">Not ready yet</span>;
  if (state === "error") return <span className="badge not">Couldn't check</span>;
  return null;
}

/**
 * A blurred, empty glass card appears while we look the person up, then sharpens into their card.
 * (Two layers cross-fade: a statically blurred ghost and the sharp card. Only opacity moves.)
 */
function Reveal({ person, evm, state }: { person: Person; evm: string; state: Readiness }) {
  const checking = state === "checking" || state === "empty";
  return (
    <div className="reveal">
      <m.div className="reveal-ghost glass" aria-hidden="true" initial={{ opacity: 1 }} animate={ghostLayer(checking)} transition={fadeTransition}>
        <span className="sheen" />
      </m.div>
      <m.div className="reveal-card glass" initial={{ opacity: 0 }} animate={sharpLayer(checking)} transition={fadeTransition} aria-live="polite">
        <span className="avatar">{person.name.trim().charAt(0).toUpperCase() || "•"}</span>
        <span className="reveal-text">
          <strong>{person.name.trim() || "Their name"}</strong>
          <span className="mono">{short(evm)}</span>
        </span>
        <Badge state={state} />
      </m.div>
    </div>
  );
}

function PersonRow(props: {
  index: number;
  person: Person;
  canRemove: boolean;
  duplicate: boolean;
  onChange: (p: Person) => void;
  onRemove: () => void;
  onState: (s: Readiness) => void;
}) {
  const { index, person, onState } = props;
  const parsed = useMemo(() => parseAddress(person.address), [person.address]);
  const state = useReadiness(person.address);
  useEffect(() => onState(state), [state, onState]);
  const message = props.duplicate ? "This address is already in the list." : MESSAGE[state] ?? "";

  return (
    <div className="person" role="group" aria-label={`Person ${index + 1}`}>
      <label htmlFor={`name-${index}`}>Their name</label>
      <Field>
        <input id={`name-${index}`} type="text" value={person.name} placeholder="Mia" autoComplete="off" onChange={(e) => props.onChange({ ...person, name: e.target.value })} />
      </Field>
      <label htmlFor={`addr-${index}`}>Their address</label>
      <Field>
        <input
          id={`addr-${index}`}
          type="text"
          className="mono"
          value={person.address}
          placeholder="qor1… or 0x…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onChange={(e) => props.onChange({ ...person, address: extractAddress(e.target.value) })}
          aria-describedby={`addr-msg-${index}`}
        />
      </Field>
      <AnimatePresence initial={false}>
        {parsed.ok && (
          <m.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
            <Reveal person={person} evm={parsed.evm} state={state} />
          </m.div>
        )}
      </AnimatePresence>
      <p className="status-line" id={`addr-msg-${index}`} aria-live="polite">
        {message}
      </p>
      {props.canRemove && (
        <button type="button" className="link" onClick={props.onRemove}>
          Remove {person.name.trim() || `person ${index + 1}`}
        </button>
      )}
    </div>
  );
}

/** "Invite someone": a link to /join where they make their opening card. The link carries a first name at most. */
function InvitePanel({ owner }: { owner: string }) {
  const [open, setOpen] = useState(false);
  const name = owner.trim();
  const content = {
    subject: `${name || "A friend"} wants to leave you something to read`,
    text: `${name ? `${name} wants` : "I'd like"} to leave you something to read one day. To receive it safely, please make your opening card here. It takes a minute:`,
    url: inviteLink(name),
  };
  return (
    <div className="invite">
      <Button variant="glass" onClick={() => setOpen((o) => !o)}>
        Invite someone
      </Button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div key="invite" className="invite-card glass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
            <p>
              Send this link. They make their opening card on their own phone, then send you their address. Paste it here and it turns to <strong>Ready</strong>.
            </p>
            <SharePanel content={content} copyWhat="link" label="Share the invite" />
            <p className="hint small">The link has no secrets in it.</p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WhoStep(props: { owner: string; heirs: Person[]; onChange: (h: Person[]) => void; onBack: () => void; onNext: () => void }) {
  const { heirs } = props;
  // Stable ids for the cards on screen (the saved draft keeps its simple shape).
  const nextId = useRef(heirs.length);
  const [ids, setIds] = useState<number[]>(() => heirs.map((_, i) => i));
  const [states, setStates] = useState<Record<number, Readiness>>({});

  const keys = heirs.map((h) => {
    const p = parseAddress(h.address);
    return p.ok ? p.qor : "";
  });
  const duplicate = (i: number) => !!keys[i] && keys.indexOf(keys[i]!) !== i;
  const allReady = heirs.every((h, i) => h.name.trim() && states[ids[i]!] === "ready" && !duplicate(i));
  const update = (i: number, p: Person) => props.onChange(heirs.map((h, j) => (j === i ? p : h)));

  const add = () => {
    setIds((prev) => [...prev, nextId.current++]);
    props.onChange([...heirs, { name: "", address: "" }]);
  };
  const remove = (i: number) => {
    setIds((prev) => prev.filter((_, j) => j !== i));
    props.onChange(heirs.filter((_, j) => j !== i));
  };

  const title = `${props.owner.trim() ? `${props.owner.trim()}, who` : "Who"} should *read* this one day?`;
  return (
    <StepFrame step={1} title={title} lead="Choose up to three people. The letter is sealed just for them." onBack={props.onBack} onNext={props.onNext} nextDisabled={!allReady}>
      <AnimatePresence initial={false}>
        {heirs.map((p, i) => {
          const id = ids[i]!;
          return (
            <m.div key={id} {...cardAppear}>
              <PersonRow
                index={i}
                person={p}
                canRemove={heirs.length > 1}
                duplicate={duplicate(i)}
                onChange={(np) => update(i, np)}
                onRemove={() => remove(i)}
                onState={(s) => setStates((prev) => (prev[id] === s ? prev : { ...prev, [id]: s }))}
              />
            </m.div>
          );
        })}
      </AnimatePresence>
      {heirs.length < MAX_PEOPLE && (
        <Button variant="glass" onClick={add}>
          <span className="inline-icon">
            <IconPlus size={16} /> Add another person
          </span>
        </Button>
      )}
      <InvitePanel owner={props.owner} />
      <p className="hint">
        <strong>Ready</strong> means they have set up their opening card, so a letter can be sealed for them. Paste the address they gave you.
      </p>
    </StepFrame>
  );
}
