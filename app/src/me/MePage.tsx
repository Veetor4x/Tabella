import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cancelLetter, checkIn } from "../lib/actions";
import { friendlyError } from "../lib/helper";
import { notify } from "../lib/notices";
import { type LetterView } from "../lib/registry";
import { countdown } from "../lib/time";
import { loadLetters, saveLetter, type SealedLetter } from "../lib/storage";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { SplitBody, SplitIntro } from "../ui/split";
import { EASE, cardAppear } from "../ui/motion";
import { Ring } from "../ui/Ring";
import { useResolvedLetter, useNow, useRoute } from "./hooks";
import { RemoveFromList, StuckPanel, stuckLabel } from "./StuckLetter";
import { CheckInView, StatePill, namesOf, nextLine, type CheckInPhase } from "./parts";
import { RestorePanel } from "./Restore";
import { SpareCards } from "./SpareCards";
import { Shell } from "./Shell";
import { TestBanner, TestTag } from "../ui/TestBanner";

/** One plain line under the ring: how this letter will reach the people it is for. */
export function deliveryLine(saved: SealedLetter): string {
  const name = saved.heirs[0]?.name?.trim() || "them";
  if (saved.surprise) return saved.surprise.emailed === false ? "Add an email so we can reach them" : `Delivery ready: we'll email ${name} when it opens`;
  return "Delivery ready: they'll open it with the card or link you gave them";
}

function HowThisWorks() {
  return (
    <aside className="howthis glass" aria-label="How this works">
      <strong>How this works</strong>
      <p>
        Tap I'm still here every so often. On a new phone, use <a className="inline" href="/card">Restore</a> and your I'm-still-here card.
      </p>
    </aside>
  );
}

function ListRow({ saved, go, onChanged }: { saved: SealedLetter; go: (p: string) => void; onChanged: () => void }) {
  const { resolved, view } = useResolvedLetter(saved, 15_000);
  const now = useNow();
  const names = namesOf(saved.heirs.map((h) => h.name), saved.heirs.map((h) => h.evm));
  const label = stuckLabel(resolved);
  const text = label ? label.title : view ? nextLine(view, now) : "Looking…";
  return (
    <m.li {...cardAppear}>
      <a className="letter-row glass" href={`/me/${saved.letterId}`} onClick={(e) => { e.preventDefault(); go(`/me/${saved.letterId}`); }}>
        <Ring fraction={view && !label && view.state !== "Cancelled" && view.state !== "Opened" ? countdown(view, now).fraction : 0} tone={!label && view?.state === "Warning" ? "alert" : !label && view && view.state === "Sealed" ? "ink" : "faint"} size={76} thickness={4} label="Time left" />
        <span className="letter-row-text">
          <strong>
            Letter {saved.letterId} · for {names}
            {saved.test && <> <TestTag /></>}
          </strong>
          <span>{text}</span>
          {label && <span className="row-sub">{label.line}</span>}
        </span>
        {view && !label && <StatePill state={view.state} />}
      </a>
      {label?.why && (
        <div className="row-remove">
          <RemoveFromList letter={saved} why={label.why} onRemoved={onChanged} />
        </div>
      )}
    </m.li>
  );
}

/** One letter's page: the real check-in screen for a letter on the current version; a plain label (and Remove from this list) for any other. */
function Detail({ saved, go, onChanged }: { saved: SealedLetter; go: (p: string) => void; onChanged: () => void }) {
  const { resolved, view, refresh, retry } = useResolvedLetter(saved, 6_000);
  if (!resolved) return <p className="lead">Looking for your letter…</p>;
  if (resolved.kind !== "current" || !view)
    return (
      <StuckPanel
        saved={saved}
        resolved={resolved}
        retry={retry}
        onRemoved={() => {
          onChanged();
          go("/me");
        }}
      />
    );
  return <CurrentDetail saved={saved} go={go} onChanged={onChanged} view={view} refresh={refresh} />;
}

function CurrentDetail({ saved, go, onChanged, view, refresh }: { saved: SealedLetter; go: (p: string) => void; onChanged: () => void; view: LetterView; refresh: () => Promise<LetterView | null> }) {
  const now = useNow();
  const [phase, setPhase] = useState<CheckInPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pauses = useRef<number | null>(null);
  // when a guardian pauses the timer, say so
  useEffect(() => {
    if (!view) return;
    if (pauses.current !== null && view.pausesUsed > pauses.current) notify(`${saved.guardianName || "Your guardian"} paused the timer. You have more time.`);
    pauses.current = view.pausesUsed;
  }, [view?.pausesUsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 14_000); // the thanks fades back to the plain screen
    return () => clearTimeout(t);
  }, [phase]);

  const names = namesOf(saved.heirs.map((h) => h.name), saved.heirs.map((h) => h.evm));

  async function tap() {
    setError(null);
    setPhase("working");
    try {
      await checkIn(saved.ownerCard, BigInt(saved.letterId));
      await refresh();
      setPhase("done");
      notify(`Thanks${saved.ownerName ? `, ${saved.ownerName}` : ""}. Your letter stays sealed.`);
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
      notify("Your letter was cancelled. Nobody will be able to open it.");
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
        statusLine={deliveryLine(saved)}
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
        <>
          {detail.test && <TestBanner />}
          <HowThisWorks />
          <Detail saved={detail} go={go} onChanged={reload} />
        </>
      ) : (
        <div className="step split">
          <SplitIntro>
            <HowThisWorks />
            <Headline text="My *letters*" />
            <p className="lead">Every letter you've sealed on this phone, and how long until each one needs you.</p>
          </SplitIntro>
          <SplitBody>
          {letters.length === 0 ? (
            <p className="empty glass">No letters on this phone yet. Write one, or restore a letter from its card below.</p>
          ) : (
            <ul className="letter-list">
              {[...letters].reverse().map((l) => (
                <ListRow key={`${l.registry}|${l.letterId}`} saved={l} go={go} onChanged={reload} />
              ))}
            </ul>
          )}
          <p className="center">
            <a className="btn glass" href="/write">
              Write a letter
            </a>
          </p>
          <p className="center hint">
            Got a card from someone else? <a href="/card">Use it here.</a>
          </p>
          <SpareCards />
          <RestorePanel role="owner" onDone={reload} />
          </SplitBody>
        </div>
      )}
    </Shell>
  );
}
