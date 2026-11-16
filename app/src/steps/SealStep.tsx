import { useEffect, useState } from "react";
import { friendlyError } from "../lib/helper";
import { sealLetter, type Progress } from "../lib/seal";
import { whenById, WARNING_DAYS, type WhenId } from "../lib/periods";
import type { Draft, SealedLetter } from "../lib/storage";
import { parseAddress } from "../lib/addr";
import { StepFrame } from "../ui/StepFrame";
import { joinNames } from "../ui/steps";
import { WaxSeal } from "../ui/WaxSeal";

const PROGRESS_TEXT: Record<Progress, string> = {
  postman: "Waking the Postman…",
  people: "Checking everyone is ready…",
  wrap: "Wrapping your letter…",
  send: "Pressing the wax…",
};

export function SealStep(props: { draft: Draft; onBack: () => void; onSealed: (l: SealedLetter) => void }) {
  const { draft } = props;
  const [phase, setPhase] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  const names = draft.heirs.map((h) => h.name.trim());
  const when = whenById(draft.when as WhenId);
  const quote = draft.text.trim().split("\n")[0]!.slice(0, 60);

  // If the Postman was asleep the first step can take a while: say so, kindly.
  useEffect(() => {
    if (!phase) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [phase]);

  async function seal() {
    setError(null);
    setPhase("postman");
    try {
      const heirs = draft.heirs.map((h) => {
        const p = parseAddress(h.address);
        if (!p.ok) throw new Error("bad address");
        return { name: h.name.trim(), evm: p.evm, qor: p.qor };
      });
      const letter = await sealLetter(
        {
          text: draft.text,
          heirs,
          guardianName: draft.guardian ? draft.guardian.name.trim() : null,
          quiet: when.quiet,
          warning: when.warning,
          whenLabel: when.label,
        },
        setPhase,
      );
      props.onSealed(letter);
    } catch (e) {
      setError(friendlyError(e));
      setPhase(null);
    }
  }

  return (
    <>
      <StepFrame step={4} lead="One last look. Once it's sealed, nobody can change it." onBack={props.onBack} onNext={seal} nextLabel="Seal it" nextDisabled={!!phase}>
        <section className="summary" aria-label="Your letter">
          <dl>
            <div className="row">
              <dt>Letter</dt>
              <dd>
                <span className="quote">“{quote}{draft.text.trim().length > 60 ? "…" : ""}”</span>
              </dd>
            </div>
            <div className="row">
              <dt>For</dt>
              <dd>{joinNames(names)}</dd>
            </div>
            <div className="row">
              <dt>Guardian</dt>
              <dd>{draft.guardian ? draft.guardian.name.trim() : "None"}</dd>
            </div>
            <div className="row">
              <dt>Opens after</dt>
              <dd>
                {when.id === "demo" ? "2 quiet minutes" : `${when.label} of quiet`}
                <span className="quote">{when.id === "demo" ? "then a 1-minute countdown" : `then a ${WARNING_DAYS}-day countdown`}</span>
              </dd>
            </div>
          </dl>
        </section>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
      </StepFrame>

      {phase && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="envelope" aria-hidden="true">
            <div className="body" />
            <div className="flap" />
            <div className="seal-spot">
              <WaxSeal />
            </div>
          </div>
          <p>{PROGRESS_TEXT[phase]}</p>
          {slow && <p className="small">The Postman was resting, so this first step can take up to a minute. Thank you for waiting.</p>}
        </div>
      )}
    </>
  );
}
