import { AnimatePresence, m } from "framer-motion";
import { useEffect, useState } from "react";
import { cancelLetter, checkIn } from "../lib/actions";
import { friendlyError } from "../lib/helper";
import { type LetterView } from "../lib/registry";
import { countdown } from "../lib/time";
import { loadLetters, saveLetter, type SealedLetter } from "../lib/storage";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { PenLine } from "../ui/PenLine";
import { EASE, cardAppear } from "../ui/motion";
import { Ring } from "../ui/Ring";
import { useLetter, useNow, useRoute } from "./hooks";
import { CheckInView, StatePill, namesOf, nextLine, type CheckInPhase } from "./parts";
import { RestorePanel } from "./Restore";
import { Shell } from "./Shell";

function ListRow({ saved, go }: { saved: SealedLetter; go: (p: string) => void }) {
  const { view, failed } = useLetter(saved.letterId, 15_000);
  const now = useNow();
  const names = namesOf(saved.heirs.map((h) => h.name), saved.heirs.map((h) => h.evm));
  return (
    <m.li {...cardAppear}>
      <a className="letter-row glass" href={`/me/${saved.letterId}`} onClick={(e) => { e.preventDefault(); go(`/me/${saved.letterId}`); }}>
        <Ring fraction={view && view.state !== "Cancelled" && view.state !== "Opened" ? countdown(view, now).fraction : 0} tone={view?.state === "Warning" ? "alert" : view && view.state === "Sealed" ? "ink" : "faint"} size={76} thickness={4} label="Time left" />
        <span className="letter-row-text">
          <strong>
            Letter {saved.letterId} · for {names}
          </strong>
          <span>{view ? nextLine(view, now) : failed ? "We couldn't look just now." : "Looking…"}</span>
        </span>
        {view && <StatePill state={view.state} />}
      </a>
    </m.li>
  );
}

function Detail({ saved, go, onChanged }: { saved: SealedLetter; go: (p: string) => void; onChanged: () => void }) {
  const { view, refresh } = useLetter(saved.letterId, 6_000);
  const now = useNow();
  const [phase, setPhase] = useState<CheckInPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 14_000); // the thanks fades back to the plain screen
    return () => clearTimeout(t);
  }, [phase]);

  if (!view) return <p className="lead"><PenLine label="Looking" /> Looking for your letter…</p>;
  const names = namesOf(saved.heirs.map((h) => h.name), saved.heirs.map((h) => h.evm));

  async function tap() {
    setError(null);
    setPhase("working");
    try {
      await checkIn(saved.ownerCard, BigInt(saved.letterId));
      await refresh();
      setPhase("done");
    } catch (e) {
      setError(friendlyError(e));
      setPhase("idle");
      void refresh();
    }
  }
  async function doCancel() {
    setError(null);
    setCancelling(true);
    try {
      await cancelLetter(saved.ownerCard, BigInt(saved.letterId));
      await refresh();
      setConfirming(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCancelling(false);
    }
  }
  const open = view.state === "Sealed" || view.state === "Warning";
  return (
    <div className={view.state === "Warning" ? "me-urgent" : ""}>
      <button type="button" className="link back-link" onClick={() => go("/me")}>
        ← My letters
      </button>
      <CheckInView
        view={view}
        now={now}
        ownerName={saved.ownerName}
        phase={phase}
        error={error}
        onTap={tap}
        extra={
          <>
            <dl className="facts glass">
              <div>
                <dt>Letter</dt>
                <dd>
                  {saved.letterId} <StatePill state={view.state} />
                </dd>
              </div>
              <div>
                <dt>For</dt>
                <dd>{names}</dd>
              </div>
              <div>
                <dt>Guardian</dt>
                <dd>{view.hasGuardian ? (saved.guardianName ? saved.guardianName : "Yes") + ` · pauses used ${view.pausesUsed} of 2` : "None"}</dd>
              </div>
            </dl>
            <p className="center hint">
              <a className="link" href={`/cards?letter=${saved.letterId}`}>
                Print your cards
              </a>
            </p>
            {open && !confirming && (
              <p className="center">
                <button type="button" className="link danger" onClick={() => setConfirming(true)}>
                  Cancel this letter
                </button>
              </p>
            )}
            <AnimatePresence>
              {confirming && (
                <m.section className="confirm glass" role="alertdialog" aria-labelledby="cancel-h" {...cardAppear}>
                  <h2 id="cancel-h">Cancel this letter?</h2>
                  <p>Nobody will ever be able to open it, not even the people you wrote it for. This can't be undone.</p>
                  {error && (
                    <p className="notice" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="restore-actions">
                    <Button variant="glass" onClick={() => { setConfirming(false); setError(null); }} disabled={cancelling}>
                      Keep it
                    </Button>
                    <Button onClick={doCancel} disabled={cancelling}>
                      {cancelling ? "Cancelling…" : "Yes, cancel it"}
                    </Button>
                  </div>
                </m.section>
              )}
            </AnimatePresence>
          </>
        }
      />
    </div>
  );
}

/** /me and /me/<number>: the owner's letters, with the check-in screen for each. */
export function MePage() {
  const { path, go } = useRoute();
  const [letters, setLetters] = useState<SealedLetter[]>(() => loadLetters().filter((l) => l.ownerCard));
  const reload = () => setLetters(loadLetters().filter((l) => l.ownerCard));
  const id = /^\/me\/(\d+)$/.exec(path)?.[1];
  const detail = id ? letters.find((l) => l.letterId === id) : undefined;

  return (
    <Shell here="me">
      {detail ? (
        <Detail saved={detail} go={go} onChanged={reload} />
      ) : (
        <div className="step">
          <Headline text="My *letters*" />
          <p className="lead">Every letter you've sealed on this phone, and how long until each one needs you.</p>
          {letters.length === 0 ? (
            <p className="empty glass">No letters on this phone yet. Write one, or restore a letter from its card below.</p>
          ) : (
            <ul className="letter-list">
              {[...letters].reverse().map((l) => (
                <ListRow key={l.letterId} saved={l} go={go} />
              ))}
            </ul>
          )}
          <p className="center">
            <a className="btn glass" href="/write">
              Write a letter
            </a>
          </p>
          <RestorePanel role="owner" onDone={reload} />
        </div>
      )}
    </Shell>
  );
}
