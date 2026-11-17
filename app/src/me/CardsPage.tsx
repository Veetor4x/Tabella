import { useState } from "react";
import { loadLetters, type SealedLetter } from "../lib/storage";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { APP_HOST, CARD_URL } from "../lib/config";
import { CopyButton } from "../ui/CopyButton";
import { Qr } from "../ui/Qr";
import { Shell } from "./Shell";

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One printable card: the QR code (which opens /card with the code filled in), the address, the code in words, and one plain line. */
export function PrintCard(props: { kind: "owner" | "guardian" | "opening"; title: string; line: string; use: string; code: string; letterId?: string }) {
  return (
    <>
      <article className={`print-card ${props.kind}`} aria-label={props.title}>
        <header>
          <span className="pc-brand">Tabella</span>
          <span className="pc-no">{props.letterId ? `Letter ${props.letterId}` : "Opening card"}</span>
        </header>
        <div className="pc-body">
          <div className="pc-qr">
            <Qr value={`${CARD_URL}#${props.code}`} size={132} label={`QR code for the ${props.title}`} />
            <span className="pc-url">{APP_HOST}/card</span>
          </div>
          <div>
            <h3>{props.title}</h3>
            <p>{props.line}</p>
            <p className="pc-use">{props.use}</p>
          </div>
        </div>
        <code className="mono">{props.code}</code>
        <div className="pc-copy no-print">
          <CopyButton text={props.code} label="Copy code" className="btn glass share-btn" />
        </div>
        <footer>Keep this safe, like a spare house key.</footer>
      </article>
      <article className="print-card back" aria-label="How to use this card">
        <h3>How to use this card</h3>
        <ol>
          <li>Go to {APP_HOST}/card</li>
          <li>Scan this code or type it in</li>
          <li>Follow the screen</li>
        </ol>
      </article>
    </>
  );
}

export function CardsView({ letter }: { letter: SealedLetter }) {
  const [saved, setSaved] = useState(false);
  const g = letter.guardianName || "your guardian";
  return (
    <div className="step cards-page">
      <Headline text="Your *cards*" />
      <p className="lead no-print">Two small cards keep your letter safe. Print them, or save a copy.</p>
      <ol className="card-steps no-print">
        <li>
          <strong>Print or save</strong> each card.
        </li>
        <li>
          <strong>Keep this safe, like a spare house key.</strong> If a card is lost, that copy can't be recovered.
        </li>
        {letter.guardianCard && (
          <li>
            <strong>Give the guardian card to {g}.</strong> It lets them tap “They're okay” if you go quiet.
          </li>
        )}
      </ol>
      <div className="print-area">
        <PrintCard kind="owner" letterId={letter.letterId} title="I'm-still-here card" line="This is how you tell us you're okay, so your letter stays sealed." use="Use this on /card if you change phones." code={letter.ownerCard} />
        {letter.guardianCard && <PrintCard kind="guardian" letterId={letter.letterId} title={`Guardian card for ${g}`} line={`For ${g} only. Lets them tap “They're okay” if you go quiet, up to twice.`} use={`Give this to ${g}. ${g} uses it on /card.`} code={letter.guardianCard} />}
      </div>
      <div className="no-print">
        <div className="restore-actions">
          <Button variant="glass" onClick={() => download(`tabella-cards-letter-${letter.letterId}.txt`, `Tabella, letter ${letter.letterId}\nKeep this safe, like a spare house key.\n\nI'm-still-here card:\n${letter.ownerCard}\n${letter.guardianCard ? `\nGuardian card for ${g}:\n${letter.guardianCard}\n` : ""}`)}>
            Save a copy
          </Button>
          <Button onClick={() => window.print()}>Print the cards</Button>
        </div>
        <label className="check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I've saved or printed {letter.guardianCard ? "these cards" : "this card"}.</span>
        </label>
        <p className="center">
          <a className={`btn ${saved ? "primary" : "glass"}`} href="/me">
            See my letters
          </a>
        </p>
      </div>
    </div>
  );
}

/** /cards?letter=<number>: the printable cards for a letter sealed on this phone. */
export function CardsPage() {
  const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("letter");
  const letter = loadLetters().find((l) => l.letterId === id && l.ownerCard);
  return (
    <Shell here="cards">
      {letter ? (
        <CardsView letter={letter} />
      ) : (
        <div className="step">
          <Headline text="No *cards* here." />
          <p className="lead">The cards for a letter live on the phone that sealed it. Open My letters on that phone.</p>
          <p className="center">
            <a className="btn glass" href="/me">
              My letters
            </a>
          </p>
        </div>
      )}
    </Shell>
  );
}
