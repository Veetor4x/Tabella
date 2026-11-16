import { useReducedMotion } from "framer-motion";
import { useState } from "react";
import { friendlyError } from "../lib/helper";
import { sealLetter, type Progress } from "../lib/seal";
import { whenById, WARNING_DAYS, type WhenId } from "../lib/periods";
import type { Draft, SealedLetter } from "../lib/storage";
import { parseAddress } from "../lib/addr";
import { StepFrame } from "../ui/StepFrame";
import { joinNames } from "../ui/steps";
import { useCeremony } from "../ui/ceremony";
import { isSoundOn, primeAudio } from "../lib/sound";

const PROGRESS_TEXT: Record<Progress, string> = {
  postman: "Waking the Postman…",
  people: "Checking everyone is ready…",
  wrap: "Wrapping your letter…",
  send: "Pressing the wax…",
};

export function SealStep(props: { draft: Draft; onBack: () => void; onSealed: (l: SealedLetter) => void }) {
  const { draft } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ceremony = useCeremony();
  const calm = useReducedMotion();

  const names = draft.heirs.map((h) => h.name.trim());
  const when = whenById(draft.when as WhenId);
  const quote = draft.text.trim().split("\n")[0]!.slice(0, 60);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function seal() {
    setError(null);
    setBusy(true);
    if (isSoundOn()) primeAudio(); // browsers only let sound start from a tap: this is that tap
    ceremony.show({ stage: "folding", text: PROGRESS_TEXT.postman, slow: false });
    // If the Postman was asleep the first step can take a while: say so, kindly.
    const slowTimer = setTimeout(() => ceremony.update({ slow: true }), 8000);
    try {
      const heirs = draft.heirs.map((h) => {
        const p = parseAddress(h.address);
        if (!p.ok) throw new Error("bad address");
        return { name: h.name.trim(), evm: p.evm, qor: p.qor };
      });
      const [letter] = await Promise.all([
        sealLetter(
          {
            text: draft.text,
            heirs,
            guardianName: draft.guardian ? draft.guardian.name.trim() : null,
            quiet: when.quiet,
            warning: when.warning,
            whenLabel: when.label,
          },
          (p) => ceremony.update({ text: PROGRESS_TEXT[p] }),
        ),
        wait(calm ? 0 : 2800), // let the letter finish folding into its envelope
      ]);
      clearTimeout(slowTimer);
      // It is sealed for real now: the wax drop falls and the seal stamps down.
      ceremony.update({ stage: "dropping", slow: false });
      await wait(calm ? 0 : 620);
      ceremony.update({ stage: "stamping" });
      await wait(calm ? 800 : 1350);
      props.onSealed(letter);
      ceremony.hide();
    } catch (e) {
      clearTimeout(slowTimer);
      ceremony.hide();
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <StepFrame step={4} lead="One last look. Once it's sealed, nobody can change it." onBack={props.onBack} onNext={seal} nextLabel="Seal it" nextDisabled={busy}>
        <section className="summary glass" aria-label="Your letter">
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

    </>
  );
}
