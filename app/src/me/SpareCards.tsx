import { useEffect, useState } from "react";
import { identityFromCard } from "../lib/heir";
import { findLettersForHeir } from "../lib/registry";
import { clearJoinCard, loadJoinCard } from "../lib/storage";
import { notify } from "../lib/notices";
import { Button } from "../ui/Button";

/** One saved card that has no sealed letter attached, with "Remove from this device" (and a question first). Presentational. */
export function SpareCardRow({ title, line, onRemove }: { title: string; line: string; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <li className="spare-card glass">
      <div>
        <strong>{title}</strong>
        <span>{line}</span>
      </div>
      {asking ? (
        <div className="spare-ask" role="alertdialog" aria-label="Remove this card?">
          <p>Remove this card from this phone? If you saved it elsewhere, you can still use it later.</p>
          <div className="restore-actions">
            <Button variant="glass" onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button onClick={onRemove}>Remove</Button>
          </div>
        </div>
      ) : (
        <button type="button" className="link" onClick={() => setAsking(true)}>
          Remove from this device
        </button>
      )}
    </li>
  );
}

/**
 * Cards saved on this phone that have NO sealed letter attached: today that is an opening card made on /join and never used.
 * It is only offered once the network has confirmed that no letter is addressed to it; a card with a letter (and every
 * I'm-still-here or guardian card) shows no remove option at all. Removing only clears it from this phone.
 */
export function SpareCards() {
  const [card, setCard] = useState<{ card: string } | null>(null);
  useEffect(() => {
    const saved = loadJoinCard();
    if (!saved) return;
    let alive = true;
    void (async () => {
      try {
        const id = await identityFromCard(saved.card);
        const letters = await findLettersForHeir(id.evm);
        if (alive && letters.length === 0) setCard(saved); // confirmed: nothing sealed is attached
      } catch {
        /* cannot tell right now: offer nothing */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!card) return null;
  return (
    <section className="spare-cards" aria-label="Cards saved on this phone with no letter">
      <h2>Saved on this phone, with no letter</h2>
      <ul>
        <SpareCardRow
          title="An opening card"
          line="Made on this phone, but no letter has been sealed for it yet."
          onRemove={() => {
            clearJoinCard();
            setCard(null);
            notify("Removed from this phone. If you saved it elsewhere, you can still use it later.");
          }}
        />
      </ul>
    </section>
  );
}
