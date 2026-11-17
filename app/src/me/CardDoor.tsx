import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { BAD_CARD, detectCard, extractCode, NO_LETTER, type CardKind } from "../lib/cards";
import { friendlyError } from "../lib/helper";
import { notify } from "../lib/notices";
import { OPEN_CARD_KEY } from "../open/OpenPage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { cardAppear } from "../ui/motion";
import { QrScanner } from "../ui/QrScanner";
import { HOWTO_TITLE, HowTo } from "./HowTo";
import { restoreFromCard } from "./Restore";

const TILES: { kind: CardKind; title: string; line: string }[] = [
  { kind: "owner", title: HOWTO_TITLE.owner, line: "Your I'm-still-here card: check in, manage your letters." },
  { kind: "guardian", title: HOWTO_TITLE.guardian, line: "Your guardian card: tell Tabella they're okay." },
  { kind: "opening", title: HOWTO_TITLE.opening, line: "An opening card or an email link: read it." },
];
const WHERE: Record<CardKind, string> = { owner: "your letters", guardian: "the guardian page", opening: "your letter" };

/** /card: one door for every card. Paste the code or scan it; Tabella works out what it is and takes you there. */
export function CardDoor() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<CardKind | null>(null);
  const [guide, setGuide] = useState<CardKind | null>(null);
  const started = useRef(false);

  async function go(text: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFound(null);
    try {
      const d = await detectCard(text);
      if (!d) {
        setMessage(NO_LETTER);
        return;
      }
      setFound(d.kind);
      if (d.kind === "opening") {
        try {
          sessionStorage.setItem(OPEN_CARD_KEY, d.code);
        } catch {
          /* fine: the page asks again */
        }
      } else await restoreFromCard(d.code); // remembered on this device
      notify(d.kind === "owner" ? "Welcome back. Your letters are here." : d.kind === "guardian" ? "Your guardian card is ready to use." : "We found your letter.");
      window.location.assign(d.kind === "owner" ? "/me" : d.kind === "guardian" ? "/guardian" : "/open");
    } catch (e) {
      setMessage(e instanceof Error && (e.message === BAD_CARD || /card/i.test(e.message)) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // a printed QR opens /card#<code>: the code is filled in and the door opens by itself
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return;
    const c = extractCode(decodeURIComponent(h));
    history.replaceState(null, "", window.location.pathname); // the code does not stay in the address bar
    setCode(c);
    void go(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card-door">
      <div className="door-tiles" role="group" aria-label="What kind of card do you have? (You don't have to choose: just paste it below.)">
        {TILES.map((t) => (
          <button key={t.kind} type="button" className={`door-tile glass ${guide === t.kind ? "on" : ""}`} aria-pressed={guide === t.kind} onClick={() => setGuide(guide === t.kind ? null : t.kind)}>
            <strong>{t.title}</strong>
            <span>{t.line}</span>
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {guide && (
          <m.div key={guide} {...cardAppear}>
            <HowTo kind={guide} onClose={() => setGuide(null)} />
          </m.div>
        )}
      </AnimatePresence>
      <section className="restore glass" aria-label="Use your card">
        <h2>Paste your card's code</h2>
        <p>Or scan the QR code on it. Tabella works out what kind of card it is and takes you to the right place.</p>
        <label htmlFor="door-code">The code on the card</label>
        <Field>
          <textarea
            id="door-code"
            className="card-input mono"
            rows={3}
            value={code}
            placeholder="tbl1_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              if (/tbl1_/.test(t)) {
                e.preventDefault();
                const c = extractCode(t);
                setCode(c);
                void go(c);
              }
            }}
          />
        </Field>
        {scanning && (
          <QrScanner
            onClose={() => setScanning(false)}
            onCode={(t) => {
              setScanning(false);
              const c = extractCode(t);
              setCode(c);
              void go(c);
            }}
          />
        )}
        <p className="status-line" role="status" aria-live="polite">
          {busy ? "Looking for your card…" : found ? `Found: taking you to ${WHERE[found]}.` : message ?? ""}
        </p>
        <div className="restore-actions">
          <Button variant="glass" onClick={() => setScanning((s) => !s)}>
            {scanning ? "Close the camera" : "Scan QR"}
          </Button>
          <Button disabled={busy || !code.trim()} onClick={() => void go(code)}>
            Continue
          </Button>
        </div>
      </section>
    </div>
  );
}
