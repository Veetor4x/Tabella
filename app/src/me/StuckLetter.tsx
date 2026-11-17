import { useState } from "react";
import { notify } from "../lib/notices";
import type { Resolved } from "../lib/resolve";
import { loadLetters, removeFromList, type SealedLetter } from "../lib/storage";
import { Button } from "../ui/Button";
import { useResolvedLetter } from "./hooks";
import { STATE_NOTE, namesOf } from "./parts";

/** The plain label for a saved letter that is not sealed on the current version (null for one that is, or while we are still looking). */
export function stuckLabel(r: Resolved | null): { title: string; line: string; why: "older" | "unfinished" | null } | null {
  if (!r || r.kind === "current") return null;
  if (r.kind === "older") return { title: "From an older test version", line: r.view ? STATE_NOTE[r.view.state] : "We can't read its status any more, because it was sealed on an earlier test version.", why: "older" };
  if (r.kind === "missing") return { title: "This letter didn't finish sealing", line: "It was never completed on the network, so there is nothing to look after.", why: "unfinished" };
  return { title: "Can't reach the network right now", line: "Trying again in a moment. Your letter is not affected.", why: null };
}

/** "Remove from this list", with a question first. It only clears the entry from this phone. */
export function RemoveFromList({ letter, why, onRemoved }: { letter: SealedLetter; why: "older" | "unfinished"; onRemoved: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="link" onClick={() => setAsking(true)}>
        Remove from this list
      </button>
    );
  return (
    <div className="spare-ask" role="alertdialog" aria-label="Remove this letter from the list?">
      <p>Remove this letter from this phone's list? It only clears it from this phone. Nothing on the network changes.</p>
      <div className="restore-actions">
        <Button variant="glass" onClick={() => setAsking(false)}>
          Keep it
        </Button>
        <Button
          onClick={() => {
            if (removeFromList(letter, why)) {
              notify("Removed from this phone's list.");
              onRemoved();
            } else setAsking(false);
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/** What My letters shows instead of the check-in for a letter that is not on the current version. */
export function StuckPanel({ saved, resolved, retry, onRemoved }: { saved: SealedLetter; resolved: Resolved; retry: () => void; onRemoved: () => void }) {
  const label = stuckLabel(resolved)!;
  const names = namesOf(saved.heirs.map((h) => h.name), saved.heirs.map((h) => h.evm));
  return (
    <section className="stuck glass" aria-label={label.title}>
      <span className="stuck-tag">{label.title}</span>
      <h2>
        Letter {saved.letterId} · for {names}
      </h2>
      <p>{label.line}</p>
      {label.why ? <RemoveFromList letter={saved} why={label.why} onRemoved={onRemoved} /> : (
        <button type="button" className="link" onClick={retry}>
          Try again now
        </button>
      )}
    </section>
  );
}

function OneStuck({ saved, onRemoved }: { saved: SealedLetter; onRemoved: () => void }) {
  const { resolved } = useResolvedLetter(saved);
  const label = stuckLabel(resolved);
  if (!label || !label.why) return null;
  return (
    <li className="spare-card glass">
      <div>
        <strong>{label.title}</strong>
        <span>
          Letter {saved.letterId}. {label.line}
        </span>
      </div>
      <RemoveFromList letter={saved} why={label.why} onRemoved={onRemoved} />
    </li>
  );
}

/** On /card: saved letters that are from an older test version or never finished sealing, each with "Remove from this list". Nothing for a letter sealed on the current version. */
export function StuckLetters() {
  const [letters, setLetters] = useState(() => loadLetters().filter((l) => l.ownerCard));
  const [shown, setShown] = useState(0);
  void shown;
  if (!letters.length) return null;
  return (
    <section className="spare-cards" aria-label="Saved letters from older test versions">
      <ul>
        {letters.map((l) => (
          <OneStuck key={`${l.registry}|${l.letterId}`} saved={l} onRemoved={() => (setLetters(loadLetters().filter((x) => x.ownerCard)), setShown((n) => n + 1))} />
        ))}
      </ul>
    </section>
  );
}
