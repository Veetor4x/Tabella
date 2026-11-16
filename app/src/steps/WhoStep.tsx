import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseAddress } from "../lib/addr";
import { isReady } from "../lib/seal";
import type { Person } from "../lib/storage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { MiniStack } from "../ui/MiniStack";
import { badgePop, cardEnter } from "../ui/motion";
import { StepFrame } from "../ui/StepFrame";

/** 0xE6EB…6Ca3: enough to recognise an address that does not fit the field. */
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

function Badge({ state }: { state: Readiness }) {
  // "Ready ✓" pops in with a bounce; the others simply appear
  if (state === "ready")
    return (
      <m.span key="ready" className="badge ready" {...badgePop}>
        Ready ✓
      </m.span>
    );
  if (state === "checking") return <span className="badge wait">Checking…</span>;
  if (state === "notready") return <span className="badge not">Not ready yet</span>;
  return null;
}

const MESSAGE: Partial<Record<Readiness, string>> = {
  invalid: "That doesn't look like an address. It starts with qor1 or 0x.",
  notready: "They haven't set up their opening card yet. Once they have, this turns to Ready ✓ and you can continue.",
  error: "We couldn't check just now. Please try again in a moment.",
};

function PersonRow(props: {
  index: number;
  person: Person;
  canRemove: boolean;
  duplicate: boolean;
  onChange: (p: Person) => void;
  onRemove: () => void;
  onState: (s: Readiness) => void;
}) {
  const { index, person } = props;
  const parsed = useMemo(() => parseAddress(person.address), [person.address]);
  const state = useReadiness(person.address);
  const { onState } = props;
  useEffect(() => onState(state), [state, onState]);

  return (
    <div className="person glass" role="group" aria-label={`Person ${index + 1}`}>
      <div className="person-head">
        <strong>Person {index + 1}</strong>
        <span aria-live="polite">
          <Badge state={state} />
        </span>
      </div>
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
          onChange={(e) => props.onChange({ ...person, address: e.target.value })}
          aria-describedby={`addr-msg-${index}`}
        />
      </Field>
      {parsed.ok && (
        <p className="addr-preview">
          Looks like <span>{short(parsed.evm)}</span>
        </p>
      )}
      <p className="status-line" id={`addr-msg-${index}`} aria-live="polite">
        {props.duplicate ? "This address is already in the list." : MESSAGE[state] ?? ""}
      </p>
      {props.canRemove && (
        <button type="button" className="link" onClick={props.onRemove}>
          Remove {person.name.trim() || `person ${index + 1}`}
        </button>
      )}
    </div>
  );
}

export function WhoStep(props: { heirs: Person[]; onChange: (h: Person[]) => void; onBack: () => void; onNext: () => void }) {
  const { heirs } = props;
  // Stable ids for the cards on screen (the saved draft keeps its simple shape).
  const nextId = useRef(heirs.length);
  const [ids, setIds] = useState<number[]>(() => heirs.map((_, i) => i));
  const [states, setStates] = useState<Record<number, Readiness>>({});
  const [fly, setFly] = useState<{ id: number; x: number; y: number } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const keys = heirs.map((h) => {
    const p = parseAddress(h.address);
    return p.ok ? p.qor : "";
  });
  const duplicate = (i: number) => !!keys[i] && keys.indexOf(keys[i]!) !== i;
  const allReady = heirs.every((h, i) => h.name.trim() && states[ids[i]!] === "ready" && !duplicate(i));

  const update = (i: number, p: Person) => props.onChange(heirs.map((h, j) => (j === i ? p : h)));

  function add() {
    const id = nextId.current++;
    const r = addButton.current?.getBoundingClientRect();
    // the new person's little card flies from this button into the stack
    setFly(r ? { id, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    setIds((prev) => [...prev, id]);
    props.onChange([...heirs, { name: "", address: "" }]);
  }
  function remove(i: number) {
    setIds((prev) => prev.filter((_, j) => j !== i));
    props.onChange(heirs.filter((_, j) => j !== i));
  }

  return (
    <StepFrame step={1} lead="Choose up to three people. The letter is sealed just for them." onBack={props.onBack} onNext={props.onNext} nextDisabled={!allReady}>
      <MiniStack
        fly={fly}
        items={heirs.map((h, i) => ({ id: ids[i]!, letter: h.name.trim().charAt(0).toUpperCase() || String(i + 1), ready: states[ids[i]!] === "ready" }))}
      />
      <AnimatePresence initial={false}>
        {heirs.map((p, i) => {
          const id = ids[i]!;
          return (
            <m.div key={id} {...cardEnter}>
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
        <Button ref={addButton} variant="small" onClick={add}>
          + Add another person
        </Button>
      )}
      <p className="hint">
        <strong>Ready ✓</strong> means they have set up their opening card, so a letter can be sealed for them. Paste the address they gave you.
      </p>
    </StepFrame>
  );
}
