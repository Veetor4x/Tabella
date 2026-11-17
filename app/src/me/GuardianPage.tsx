import { m } from "framer-motion";
import { useState } from "react";
import { guardianPause } from "../lib/actions";
import { friendlyError } from "../lib/helper";
import { MAX_PAUSES, type LetterView } from "../lib/registry";
import { countdown, ringText } from "../lib/time";
import { loadGuardian, type GuardianEntry } from "../lib/storage";
import { Headline } from "../ui/Headline";
import { EASE, cardAppear } from "../ui/motion";
import { PenLine } from "../ui/PenLine";
import { Ring } from "../ui/Ring";
import { useLetter, useNow } from "./hooks";
import { StatePill, namesOf } from "./parts";
import { RestorePanel } from "./Restore";
import { Shell } from "./Shell";

/** One letter, as its guardian sees it: how it is doing, how many pauses are left, and one button. */
export function GuardianView(props: { view: LetterView; now: number; name?: string; busy: boolean; thanks: boolean; error?: string | null; onTap: () => void }) {
  const { view, now } = props;
  const c = countdown(view, now);
  const left = Math.max(0, MAX_PAUSES - view.pausesUsed);
  const open = view.state === "Sealed" || view.state === "Warning";
  const text = ringText(view, c);
  const urgent = view.state === "Warning";
  return (
    <article className={`guardian-card glass ${urgent ? "urgent" : ""}`}>
      <div className="guardian-top">
        <Ring fraction={open ? c.fraction : 0} tone={urgent ? "alert" : open ? "ink" : "faint"} size={120} thickness={4} label={`${text.big} ${text.small}`}>
          <span className="ring-big small">{text.big}</span>
        </Ring>
        <div>
          <h2>A letter for {namesOf([], view.heirs)}</h2>
          <p>
            <StatePill state={view.state} /> {open ? (urgent ? "They haven't checked in. It opens when this runs out." : "They'll check in before this runs out.") : view.state === "Opened" ? "The time ran out." : "It was cancelled."}
          </p>
        </div>
      </div>
      <div className="pauses" aria-label={`Pauses left: ${left} of ${MAX_PAUSES}`}>
        <span>Pauses left</span>
        <span className="pips" aria-hidden="true">
          {Array.from({ length: MAX_PAUSES }, (_, i) => (
            <m.i key={i} className={i < left ? "on" : ""} initial={false} animate={{ scale: i < left ? 1 : 0.7, opacity: i < left ? 1 : 0.4 }} transition={{ duration: 0.6, ease: EASE }} />
          ))}
        </span>
        <strong>
          {left} of {MAX_PAUSES}
        </strong>
      </div>
      {open && (
        <>
          <button type="button" className="btn primary big-tap" onClick={props.onTap} disabled={props.busy || left === 0}>
            {props.busy ? <><PenLine label="Confirming" /> Confirming with your card…</> : "They're okay"}
          </button>
          <p className="status-line center" role="status" aria-live="polite">
            {props.thanks ? `Thank you${props.name ? `, ${props.name}` : ""}. They have more time.` : left === 0 ? "Both pauses are used. After this, only they can check in." : "Tap if you know they're just ill or away. It gives them more time."}
          </p>
        </>
      )}
      {props.error && (
        <p className="notice" role="alert">
          {props.error}
        </p>
      )}
    </article>
  );
}

function Entry({ entry }: { entry: GuardianEntry }) {
  const { view, refresh } = useLetter(entry.letterId, 6_000);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!view) return <p className="lead">Looking for the letter…</p>;
  async function tap() {
    setBusy(true);
    setError(null);
    setThanks(false);
    try {
      await guardianPause(entry.card, BigInt(entry.letterId));
      await refresh();
      setThanks(true);
    } catch (e) {
      setError(friendlyError(e));
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  return <GuardianView view={view} now={now} name={entry.name} busy={busy} thanks={thanks} error={error} onTap={tap} />;
}

/** /guardian: restore the guardian card, then one button. */
export function GuardianPage() {
  const [entries, setEntries] = useState<GuardianEntry[]>(() => loadGuardian());
  return (
    <Shell here="guardian">
      <div className="step">
        <Headline text={entries.length ? "Are they *okay*?" : "You're someone's *guardian*."} />
        <p className="lead">
          {entries.length ? "If you know they're just ill or away, tap “They're okay”. You can do this twice." : "They trusted you with a guardian card. Restore it here to see their letter."}
        </p>
        {entries.map((e) => (
          <m.div key={e.letterId} {...cardAppear}>
            <Entry entry={e} />
          </m.div>
        ))}
        <RestorePanel role="guardian" onDone={() => setEntries(loadGuardian())} />
      </div>
    </Shell>
  );
}
