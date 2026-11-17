import { useState } from "react";
import { cardDecode } from "../../../shared/tabella-crypto";
import { cardFingerprint } from "../lib/actions";
import { friendlyError } from "../lib/helper";
import { findLetters } from "../lib/registry";
import { loadLetters, saveGuardian, saveLetter, type SealedLetter } from "../lib/storage";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { QrScanner } from "../ui/QrScanner";

export type Found = { owner: string[]; guardian: string[] };

/** Turns a card (pasted or scanned) back into its letters, on this device. */
export async function restoreFromCard(code: string): Promise<Found> {
  cardDecode(code); // a readable error for a typo
  const clean = code.replace(/\s+/g, "");
  const { owner, guardian } = await findLetters(cardFingerprint(clean));
  for (const v of owner) {
    const have = loadLetters().find((l) => l.letterId === v.id.toString() && (!l.registry || l.registry.toLowerCase() === v.registry.toLowerCase()));
    const letter: SealedLetter = have
      ? { ...have, registry: have.registry || v.registry, ownerCard: clean }
      : { version: 1, letterId: v.id.toString(), txHash: "", createdAt: new Date().toISOString(), registry: v.registry, heirs: v.heirs.map((evm) => ({ name: "", evm, qor: "" })), guardianName: v.hasGuardian ? "" : null, whenLabel: "", quietSeconds: v.quiet, warningSeconds: v.warning, ownerCard: clean, guardianCard: null };
    saveLetter(letter);
  }
  for (const v of guardian) {
    const mine = loadLetters().find((l) => l.letterId === v.id.toString() && l.guardianCard === clean);
    saveGuardian({ letterId: v.id.toString(), card: clean, name: mine?.guardianName || undefined });
  }
  return { owner: owner.map((v) => v.id.toString()), guardian: guardian.map((v) => v.id.toString()) };
}

/** "Restore from a card": paste the code, or scan the QR code on the printed card. */
export function RestorePanel({ role, onDone }: { role: "owner" | "guardian"; onDone: (f: Found) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(text: string) {
    setBusy(true);
    setMessage(null);
    try {
      const f = await restoreFromCard(text);
      const mine = role === "owner" ? f.owner : f.guardian;
      const other = role === "owner" ? f.guardian : f.owner;
      if (mine.length) {
        setCode("");
        onDone(f);
      } else if (other.length) setMessage(role === "owner" ? "That's a guardian card. It works on the guardian page." : "That's an I'm-still-here card. It works on the My letters page.");
      else setMessage("We couldn't find a letter for that card. Please check the code and try again.");
    } catch (e) {
      setMessage(e instanceof Error && !(e as { code?: string }).code && /card/i.test(e.message) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="restore glass" aria-label="Restore from a card">
      <h2>Restore from a card</h2>
      <p>On a new phone? Paste the code from your {role === "owner" ? "I'm-still-here card" : "guardian card"}, or scan its QR code, and the {role === "owner" ? "letters come" : "letter comes"} back.</p>
      <label htmlFor={`card-${role}`}>The code on the card</label>
      <Field>
        <textarea id={`card-${role}`} className="card-input mono" rows={3} value={code} placeholder="tbl1_…" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
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
      <p className="status-line" role="status" aria-live="polite">
        {busy ? "Looking for your letters…" : message ?? ""}
      </p>
      <div className="restore-actions">
        <Button variant="glass" onClick={() => setScanning((s) => !s)}>
          Scan the QR code
        </Button>
        <Button disabled={busy || !code.trim()} onClick={() => run(code)}>
          Restore
        </Button>
      </div>
    </section>
  );
}
