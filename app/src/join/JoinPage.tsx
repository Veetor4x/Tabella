import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { becomeReady, identityFromCard, isOpeningKeyRegistered, newCard, registerWithQoreX, type JoinProgress } from "../lib/heir";
import { friendlyError } from "../lib/helper";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { PenLine } from "../ui/PenLine";
import { IconCheck } from "../ui/icons";
import { EASE, cardAppear } from "../ui/motion";
import { SharePanel } from "../ui/SharePanel";
import { canNativeShare, nativeShare } from "../lib/share";
import { PrintCard } from "../me/CardsPage";
import { Shell } from "../me/Shell";

const KEY = "tabella.join.v1";
interface Saved {
  card: string;
  /** set once her opening card is registered */
  qor?: string;
  /** she used QoreX: her address is the QoreX one */
  via?: "qorex";
}
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (s: Saved | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* fine: she can still print the card from this screen */
  }
};

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STEP_TEXT: Record<JoinProgress, string> = {
  waking: "Getting things ready…",
  funding: "Preparing your card…",
  waiting: "Preparing your card…",
  registering: "Setting up your opening card…",
  finishing: "Almost ready…",
  done: "Ready.",
};

type Phase = "intro" | "working" | "card" | "error";

export function JoinPage() {
  const from = (new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("from") ?? "").trim().slice(0, 30);
  const [saved, setSaved] = useState<Saved | null>(() => load());
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState<JoinProgress>("waking");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [qorexNote, setQorexNote] = useState<string | null>(null);
  const running = useRef(false);

  const finish = (card: string, qor: string, via?: "qorex") => {
    const s: Saved = { card, qor, via };
    save(s);
    setSaved(s);
    setAddress(qor);
    setPhase("card");
  };

  async function run(card: string) {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase("working");
    setProgress("waking");
    try {
      const id = await becomeReady(card, setProgress);
      finish(card, id.qor);
    } catch (e) {
      setError(friendlyError(e));
      setPhase("error");
    } finally {
      running.current = false;
    }
  }

  // coming back to this page: pick up where she left off
  useEffect(() => {
    if (!saved) return;
    void (async () => {
      try {
        if (saved.qor && (await isOpeningKeyRegistered(saved.qor))) {
          setAddress(saved.qor);
          setPhase("card");
        } else if (!saved.via) {
          const id = await identityFromCard(saved.card);
          if (await isOpeningKeyRegistered(id.qor, id.keys)) finish(saved.card, id.qor);
          else void run(saved.card);
        }
      } catch {
        /* she can start again from the first screen */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const make = () => {
    const card = saved?.card ?? newCard(); // a card made before a failure is kept, so nothing is lost
    save({ card });
    setSaved({ card });
    void run(card);
  };

  async function viaQoreX() {
    setQorexNote(null);
    const card = saved?.card ?? newCard();
    save({ card, via: "qorex" });
    setSaved({ card, via: "qorex" });
    setPhase("working");
    setProgress("registering");
    try {
      const { qor } = await registerWithQoreX(card);
      finish(card, qor, "qorex");
    } catch (e) {
      setPhase("intro");
      setQorexNote(friendlyError(e));
    }
  }

  const who = from || "Someone who cares about you";
  const card = saved?.card;
  const message = address
    ? { subject: "My opening card is ready", text: `${from ? `Hi ${from}, my` : "My"} opening card is ready. Here is my address:\n\n${address}` }
    : null;

  return (
    <Shell here="join" className="join-page">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "intro" && (
          <m.div key="intro" className="step" {...cardAppear}>
            <Headline text={`${from || "Someone"} wants to leave you something to *read* one day.`} />
            <p className="lead">{from ? `${who} wrote you a letter.` : "Someone who cares about you wrote a letter."} To receive it safely, you'll make an opening card. It takes about a minute, and you don't need anything but this phone.</p>
            <div className="actions static">
              <Button arrow="forward" onClick={make}>
                Make my opening card
              </Button>
            </div>
            <p className="hint">
              <button type="button" className="link" onClick={viaQoreX}>
                Use QoreX instead
              </button>
            </p>
            {qorexNote && (
              <p className="status-line" role="status">
                {qorexNote}
              </p>
            )}
          </m.div>
        )}

        {phase === "working" && (
          <m.div key="working" className="step center-step" {...cardAppear}>
            <Headline text="One moment…" />
            <p className="lead" role="status" aria-live="polite">
              {STEP_TEXT[progress]}
            </p>
            <div className="waiting-pen">
              <PenLine label="Working" />
            </div>
            <p className="hint">This can take up to a minute. Please keep this page open.</p>
          </m.div>
        )}

        {phase === "error" && (
          <m.div key="error" className="step" {...cardAppear}>
            <Headline text="Not quite *yet*." />
            <p className="lead" role="alert">
              {error}
            </p>
            <div className="actions static">
              <Button arrow="forward" onClick={() => card && void run(card)}>
                Try again
              </Button>
            </div>
          </m.div>
        )}

        {phase === "card" && card && address && message && (
          <m.div key="card" className="step cards-page" {...cardAppear}>
            <Headline text="Your opening card is *ready*." />
            <p className="lead no-print">This card is what opens the letter. Print it or save a copy.</p>
            <div className="print-area">
              <PrintCard kind="opening" title="Your opening card" line={`Scan it, or type the code, on the day you open your letter. It works on any phone.`} code={card} />
            </div>
            <div className="card-actions no-print">
              <Button variant="glass" onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="glass" onClick={() => download("tabella-opening-card.txt", `Tabella opening card\n\n${card}\n\nKeep this safe, like a spare house key.\n`)}>
                Save a copy
              </Button>
            </div>
            <p className="keep no-print">
              <strong>Keep this safe, like a spare house key.</strong> Without it, your letter can't be opened, and nobody can bring it back for you.
            </p>
            <label className="check no-print">
              <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} />
              <span>I've printed or saved my card.</span>
            </label>
            <AnimatePresence initial={false}>
              {kept && (
                <m.section key="send" className="send-card glass no-print" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: EASE }} aria-label="Send to someone">
                  <span className="badge ready">
                    Ready <IconCheck size={15} />
                  </span>
                  <p>{from || "They"} will paste it in and see you turn to Ready. It's only your address: it can't open anything.</p>
                  <code className="mono addr">{address}</code>
                  <Button arrow="forward" onClick={() => (canNativeShare() ? void nativeShare(message) : setShowShare(true))}>
                    {from ? `Send to ${from}` : "Send my address"}
                  </Button>
                  {(showShare || !canNativeShare()) && <SharePanel content={message} copyWhat="text" label={from ? `Send to ${from}` : "Send my address"} />}
                </m.section>
              )}
            </AnimatePresence>
          </m.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
