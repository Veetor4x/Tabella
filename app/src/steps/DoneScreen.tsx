import { m } from "framer-motion";
import { useEffect, useState } from "react";
import { EXPLORER } from "../lib/config";
import { longDay } from "../lib/periods";
import type { SealedLetter } from "../lib/storage";
import { joinNames } from "../ui/steps";
import { Button } from "../ui/Button";
import { Headline } from "../ui/Headline";
import { fadeUp, sealSettle } from "../ui/motion";
import { PeopleMap } from "../ui/PeopleMap";
import { playSealPress } from "../landing/sfx";
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
    <section className="card-box glass" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>{props.blurb}</p>
      <code className="code mono">{props.code}</code>
      <div className="card-actions">
        <Button
          variant="glass"
          onClick={async () => {
            setCopied(await copyText(props.code));
            setTimeout(() => setCopied(false), 2500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="glass" onClick={() => download(props.file, `Tabella: ${props.title}\nKeep this safe, like a spare house key.\n\n${props.code}\n`)}>
          Save a copy
        </Button>
      </div>
    </section>
  );
}

export function DoneScreen({ letter, onAnother }: { letter: SealedLetter; onAnother: () => void }) {
  const [saved, setSaved] = useState(false);
  const names = joinNames(letter.heirs.map((h) => h.name));

  // One soft low tone as the seal settles (only if sound was switched on).
  useEffect(() => {
    const t = setTimeout(() => void playSealPress(), 1300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="done-screen">
      <Headline text="Sealed." />
      <m.p className="lead center" {...fadeUp(0.7)}>
        Only {names} can open this.
      </m.p>
      {letter.releaseAt && (
        <m.p className="lead center small" {...fadeUp(0.8)}>
          It opens on {longDay(letter.releaseAt)}, whether or not you check in.
        </m.p>
      )}
      {letter.surprise && (
        <m.p className="lead center small" {...fadeUp(0.9)}>
          When the time comes, we'll find {names} by email
          {letter.surprise.backups ? `, and ask ${letter.surprise.backups === 1 ? "your backup person" : `your ${letter.surprise.backups} backup people`} to help if they can't be reached` : ""}.
        </m.p>
      )}

      <PeopleMap
        variant="night"
        start={1.1}
        people={letter.heirs.map((h) => h.name)}
        guardian={letter.guardianName}
        root={
          <m.div className="seal-wrap" {...sealSettle}>
            <WaxSeal />
          </m.div>
        }
      />

      <m.div {...fadeUp(2.4)}>
        <Card
          title={letter.releaseAt ? "Your card" : "Your I'm-still-here card"}
          blurb={letter.releaseAt ? "Keep this safe, like a spare house key. It's the only way to cancel the letter before its day." : "Keep this safe, like a spare house key. It's how you tell us you're okay, so the letter stays sealed."}
          code={letter.ownerCard}
          file={letter.releaseAt ? "tabella-card.txt" : "tabella-im-still-here-card.txt"}
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
          <a className="link" href={`/cards?letter=${letter.letterId}`}>
            Print or save your cards
          </a>
          {" · "}
          <a className="link" href="/me">
            See my letters
          </a>
          {" · "}
          <a className="link" href={`${EXPLORER}/tx/${letter.txHash}`} target="_blank" rel="noreferrer">
            See the public receipt
          </a>
        </p>

        <div className="actions static">
          <Button disabled={!saved} arrow="forward" onClick={onAnother}>
            Write another letter
          </Button>
        </div>
      </m.div>
    </div>
  );
}
