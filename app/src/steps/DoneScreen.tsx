import { useState } from "react";
import { EXPLORER } from "../lib/config";
import type { SealedLetter } from "../lib/storage";
import { joinNames } from "../ui/steps";
import { WaxSeal } from "../ui/WaxSeal";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Card(props: { title: string; blurb: string; code: string; file: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="card-box" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>{props.blurb}</p>
      <code className="code mono">{props.code}</code>
      <div className="card-actions">
        <button
          type="button"
          className="btn secondary small"
          onClick={async () => {
            setCopied(await copyText(props.code));
            setTimeout(() => setCopied(false), 2500);
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button type="button" className="btn secondary small" onClick={() => download(props.file, `Tabella: ${props.title}\nKeep this safe, like a spare house key.\n\n${props.code}\n`)}>
          Save a copy
        </button>
      </div>
    </section>
  );
}

export function DoneScreen({ letter, onAnother }: { letter: SealedLetter; onAnother: () => void }) {
  const [saved, setSaved] = useState(false);
  const names = joinNames(letter.heirs.map((h) => h.name));
  return (
    <>
      <div className="done-seal">
        <WaxSeal stamp />
      </div>
      <h1 tabIndex={-1} style={{ textAlign: "center" }}>
        Sealed.
      </h1>
      <p className="lead" style={{ textAlign: "center" }}>
        Only {names} can open this, even with future super-computers.
      </p>

      <Card
        title="Your I'm-still-here card"
        blurb="Keep this safe, like a spare house key. It's how you tell us you're okay, so the letter stays sealed."
        code={letter.ownerCard}
        file="tabella-im-still-here-card.txt"
      />
      {letter.guardianCard && letter.guardianName && (
        <Card
          title={`${letter.guardianName}'s guardian card`}
          blurb={`Give this to ${letter.guardianName}. It lets them tap “They're okay” if you go quiet.`}
          code={letter.guardianCard}
          file="tabella-guardian-card.txt"
        />
      )}

      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I've saved or printed {letter.guardianCard ? "these cards" : "this card"}.</span>
      </label>

      <p className="hint">
        <a className="link" href={`${EXPLORER}/tx/${letter.txHash}`} target="_blank" rel="noreferrer">
          See the public receipt
        </a>
      </p>

      <div className="actions">
        <button type="button" className="btn primary" disabled={!saved} onClick={onAnother}>
          Write another letter
        </button>
      </div>
    </>
  );
}
