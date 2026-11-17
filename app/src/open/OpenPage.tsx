import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { identityFromCard, type Identity } from "../lib/heir";
import { friendlyError, SealProblem } from "../lib/helper";
import { openLetter, reportOpened } from "../lib/openLetter";
import { announceOpened } from "../lib/openedSignal";
import { DecodedText } from "../ui/Decode";
import { Signature, signerOf } from "../ui/Signature";
import { SurpriseOpen } from "./SurpriseOpen";
import { findLettersForHeir, readHeirLetter, type HeirLetter } from "../lib/registry";
import { Story, sheetLines } from "../landing/stories";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Headline } from "../ui/Headline";
import { PenLine } from "../ui/PenLine";
import { cardAppear, EASE } from "../ui/motion";
import { QrScanner } from "../ui/QrScanner";
import { Shell } from "../me/Shell";

const KEY = "tabella.open.v1"; // this tab only: the card is kept in session storage so a refresh does not ask again

/** Time the scene needs: the envelope opens, the camera comes in over about 2.6 s, then holds for a moment. */
export const OPEN_SCENE_MS = 8800;

function CardFinder({ onFound }: { onFound: (id: Identity, letters: HeirLetter[]) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const [address, setAddress] = useState("");

  async function run(text: string, addr?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const id = await identityFromCard(text); // a readable error for a typo
      const letters = await findLettersForHeir(addr?.trim() || id.evm);
      if (!letters.length) {
        setNone(true);
        setMessage("We couldn't find a letter for that card. Please check you're using your own opening card.");
        return;
      }
      try {
        sessionStorage.setItem(KEY, id.card);
      } catch {
        /* fine */
      }
      onFound(id, letters);
    } catch (e) {
      setMessage(e instanceof Error && !(e as { code?: string }).code && /card/i.test(e.message) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <m.section className="restore glass" aria-label="Open your letter" {...cardAppear}>
      <h2>Your opening card</h2>
      <p>Paste the code from your opening card, or scan its QR code, and we'll look for the letter that's waiting for you.</p>
      <label htmlFor="open-card">The code on the card</label>
      <Field>
        <textarea id="open-card" className="card-input mono" rows={3} value={code} placeholder="tbl1_…" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
      </Field>
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onCode={(t) => {
            setScanning(false);
            setCode(t);
            void run(t);
          }}
        />
      )}
      {none && (
        <div className="alt-address">
          <label htmlFor="open-addr">Made your card with QoreX? Paste your address here</label>
          <Field>
            <input id="open-addr" className="mono" type="text" value={address} placeholder="qor1… or 0x…" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>
      )}
      <p className="status-line" role="status" aria-live="polite">
        {busy && <PenLine label="Looking" />}
        {busy ? "Looking for your letter…" : message ?? ""}
      </p>
      <div className="restore-actions">
        <Button variant="glass" onClick={() => setScanning((s) => !s)}>
          Scan the QR code
        </Button>
        <Button disabled={busy || !code.trim()} onClick={() => run(code, address)}>
          Find my letter
        </Button>
      </div>
    </m.section>
  );
}

/** The sealed envelope on a dark panel (the same line drawing as the film), still. */
export function Panel({ children, soft = false }: { children: React.ReactNode; soft?: boolean }) {
  return <div className={`scene-stage ${soft ? "soft" : ""}`}>{children}</div>;
}

export function LetterCard({ id, first, autoOpen = false }: { id: Identity; first: HeirLetter; autoOpen?: boolean }) {
  const [letter, setLetter] = useState(first);
  const [phase, setPhase] = useState<"idle" | "opening" | "reading">("idle");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const calm = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // keep looking, gently, until there is something to do
  useEffect(() => {
    if (letter.state === "ready" || letter.state === "withdrawn") return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        setLetter(await readHeirLetter(letter.id));
      } catch {
        /* try again next time */
      }
    }, letter.state === "on-its-way" ? 4000 : 5000);
    return () => clearInterval(t);
  }, [letter.id, letter.state]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const auto = useRef(false);
  useEffect(() => {
    if (autoOpen && letter.state === "ready" && !auto.current) {
      auto.current = true;
      void open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, letter.state]);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      const t = await openLetter(id, letter);
      setText(t);
      announceOpened(); // the envelope on the front page's cloud floats away
      void reportOpened(id.card, letter.id); // a surprise letter's Postman stops asking (quiet for ordinary letters)
      if (calm) setPhase("reading");
      else {
        setPhase("opening");
        timer.current = setTimeout(() => setPhase("reading"), OPEN_SCENE_MS);
      }
    } catch (e) {
      setError(e instanceof SealProblem ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "opening" && text !== null)
    return (
      <m.div className="letter-open" {...cardAppear}>
        <Panel>
          <Story id="open" lines={sheetLines(text)} />
        </Panel>
        <button type="button" className="link skip-open" onClick={() => { clearTimeout(timer.current); setPhase("reading"); }}>
          Skip
        </button>
      </m.div>
    );

  if (phase === "reading" && text !== null)
    return (
      <m.article className="reader glass" aria-label="Your letter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, ease: EASE }}>
        <DecodedText text={text} onDone={() => setDecoded(true)} />
        <Signature name={signerOf(text)} play={decoded || !!calm} />
        {!calm && (
          <button type="button" className="link" onClick={() => setPhase("opening")}>
            Watch it open again
          </button>
        )}
      </m.article>
    );

  return <HeirStateView state={letter.state} busy={busy} error={error} onOpen={open} />;
}

/** What a loved one sees while the letter is not open: only sealed, on its way, or here. Presentational, so the front page can show the same screen. */
export function HeirStateView({ state, busy = false, pressed = false, error, onOpen }: { state: HeirLetter["state"]; busy?: boolean; pressed?: boolean; error?: string | null; onOpen: () => void }) {
  return (
    <m.div className="letter-state" {...cardAppear}>
      <Panel soft={state === "on-its-way"}>
        <Story id="seal" lines={[]} still />
      </Panel>
      {state === "sealed" && <h2 className="state-line">Your letter is still safely sealed.</h2>}
      {state === "on-its-way" && (
        <>
          <h2 className="state-line">Your letter is on its way.</h2>
          <p className="lead small" role="status" aria-live="polite">
            It's being delivered to you now. This page updates by itself, so you can stay here a moment.
          </p>
          <div className="waiting-pen">
            <PenLine label="Waiting for your letter" />
          </div>
        </>
      )}
      {state === "ready" && (
        <>
          <h2 className="state-line">Your letter is here.</h2>
          <div className="actions static">
            <Button arrow="forward" disabled={busy || pressed} onClick={onOpen}>
              Open your letter
            </Button>
          </div>
        </>
      )}
      {state === "withdrawn" && <h2 className="state-line">This letter was taken back.</h2>}
      {error && (
        <p className="status-line" role="alert">
          {error}
        </p>
      )}
    </m.div>
  );
}

export function OpenPage() {
  const letterParam = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("letter") ?? "";
  const [found, setFound] = useState<{ id: Identity; letters: HeirLetter[] } | null>(null);
  const [restoring, setRestoring] = useState(false);

  // a refresh in the same tab: use the card we already have
  useEffect(() => {
    let card: string | null = null;
    try {
      card = sessionStorage.getItem(KEY);
    } catch {
      /* none */
    }
    if (!card) return;
    setRestoring(true);
    void (async () => {
      try {
        const id = await identityFromCard(card!);
        const letters = await findLettersForHeir(id.evm);
        if (letters.length) setFound({ id, letters });
      } catch {
        /* ask again */
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  return (
    <Shell here="open" className="open-page">
      <div className="step">
        <Headline text={found ? (found.letters.length > 1 ? "Your *letters*." : "Your *letter*.") : "Open your *letter*."} />
        <AnimatePresence mode="wait" initial={false}>
          {letterParam && !found ? (
            <div key="surprise" className="letters-list">
              <SurpriseOpen letterId={letterParam} />
              <p className="hint">
                <a className="link" href="/open">
                  I have an opening card instead
                </a>
              </p>
            </div>
          ) : found ? (
            <div key="letters" className="letters-list">
              {found.letters.map((l) => (
                <LetterCard key={l.id.toString()} id={found.id} first={l} />
              ))}
            </div>
          ) : restoring ? (
            <p className="lead" key="r" role="status">
              <PenLine label="Looking" /> Looking for your letter…
            </p>
          ) : (
            <CardFinder key="finder" onFound={(id, letters) => setFound({ id, letters })} />
          )}
        </AnimatePresence>
      </div>
    </Shell>
  );
}
