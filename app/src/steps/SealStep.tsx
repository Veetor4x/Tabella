import { m } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { useState } from "react";
import { friendlyError } from "../lib/helper";
import { sealLetter, type Progress } from "../lib/seal";
import { whenById, WARNING_DAYS, type WhenId } from "../lib/periods";
import type { Draft, SealedLetter } from "../lib/storage";
import { parseAddress } from "../lib/addr";
import { IconLetter } from "../ui/icons";
import { PeopleMap } from "../ui/PeopleMap";
import { StepFrame } from "../ui/StepFrame";
import { WaxSeal } from "../ui/WaxSeal";
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
  const [progress, setProgress] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calm = useReducedMotion();

  const names = draft.heirs.map((h) => h.name.trim());
  const when = whenById(draft.when as WhenId);
  const quote = draft.text.trim().split("\n")[0]!.slice(0, 44);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function seal() {
    setError(null);
    setBusy(true);
    setProgress(PROGRESS_TEXT.postman);
    // bring the map to the middle of the screen, so the shimmer is what you watch
    document.querySelector(".map")?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    if (isSoundOn()) primeAudio(); // browsers only let sound start from a tap: this is that tap
    // If the Postman was asleep the first step can take a while: say so, kindly.
    const slowTimer = setTimeout(() => setSlow(true), 8000);
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
          (p) => setProgress(PROGRESS_TEXT[p]),
        ),
        wait(calm ? 0 : 2600), // let the slow shimmer cross the map at least once
      ]);
      clearTimeout(slowTimer);
      props.onSealed(letter);
    } catch (e) {
      clearTimeout(slowTimer);
      setError(friendlyError(e));
      setBusy(false);
      setSlow(false);
      setProgress(null);
    }
  }

  const root = (
    <m.div className="letter-node glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
      <span className="letter-ico">
        <IconLetter size={18} />
      </span>
      <span className="letter-quote">“{quote}{draft.text.trim().length > 44 ? "…" : ""}”</span>
      <WaxSeal className="mini-seal" />
    </m.div>
  );

  return (
    <StepFrame
      step={4}
      title="Ready to *seal* it?"
      lead="One last look. Once it's sealed, nobody can change it."
      onBack={busy ? undefined : props.onBack}
      onNext={seal}
      nextLabel={busy ? "Sealing…" : "Seal it"}
      nextDisabled={busy}
    >
      <PeopleMap root={root} people={names} guardian={draft.guardian ? draft.guardian.name.trim() : null} variant="day" working={busy} />
      <p className="status-line center" role="status" aria-live="polite">
        {busy ? (slow ? "The Postman is waking up. This can take a minute…" : progress) : ""}
      </p>
      <p className="hint center">{when.id === "demo" ? "Opens after 2 quiet minutes, then a 1-minute countdown." : `Opens after ${when.label} of quiet, then a ${WARNING_DAYS}-day countdown.`}</p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </StepFrame>
  );
}
