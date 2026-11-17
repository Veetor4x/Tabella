import { m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { unpackContainer, type Manifest } from "../../../shared/surprise";
import { cardEncode } from "../../../shared/tabella-crypto";
import { identityFromCard, type Identity } from "../lib/heir";
import { friendlyError } from "../lib/helper";
import { WrongAnswer, unlockSeed } from "../lib/locks";
import { hexToU8 } from "../lib/seal";
import { readHeirLetter, type HeirLetter } from "../lib/registry";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { PenLine } from "../ui/PenLine";
import { cardAppear } from "../ui/motion";
import { SharePanel } from "../ui/SharePanel";
import { HeirStateView, LetterCard } from "./OpenPage";

const KINDER = [
  "That's not quite it. Take your time.",
  "Not this time. Think about how you might have said it, then try again.",
  "Still not right. We'll wait a few seconds so you can think.",
  "Not yet. There's no rush: the letter is safe.",
];
/** Seconds to wait after the 1st, 2nd, 3rd... wrong answer. */
export const slowDown = (wrong: number) => (wrong <= 1 ? 0 : Math.min(60, 3 * 2 ** (wrong - 2)));

type Who = { kind: "recipient" } | { kind: "backup"; i: number };

/** "/open?letter=26": the person is asked their private question. A backup is asked their own and can help. */
export function SurpriseOpen({ letterId }: { letterId: string }) {
  const [letter, setLetter] = useState<HeirLetter | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    const look = async () => {
      try {
        const l = await readHeirLetter(BigInt(letterId));
        if (alive) setLetter(l);
      } catch {
        if (alive) setMissing(true);
      }
    };
    void look();
    const t = setInterval(() => !document.hidden && letter?.state !== "ready" && void look(), 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [letterId, letter?.state]);

  if (!/^[1-9]\d{0,17}$/.test(letterId) || missing) return <p className="lead">We couldn't find that letter. Please check the link you were sent.</p>;
  if (!letter) return <p className="lead" role="status"><PenLine label="Looking" /> Looking for your letter…</p>;
  if (letter.state !== "ready") return <HeirStateView state={letter.state} onOpen={() => {}} />;
  const parsed = unpackContainer(hexToU8(letter.letterCiphertext));
  if (!parsed) return <p className="lead">This letter opens with an opening card. <a className="link" href="/open">Use your card here</a>.</p>;
  return <Gate letter={letter} manifest={parsed.manifest} />;
}

function Gate({ letter, manifest }: { letter: HeirLetter; manifest: Manifest }) {
  const [who, setWho] = useState<Who>({ kind: "recipient" });
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [mode, setMode] = useState<"choose" | "open" | "send">("choose");
  const tries = useRef<Record<string, number>>({});

  const key = who.kind === "recipient" ? "r" : `b${who.i}`;
  const person = who.kind === "recipient" ? manifest.recipient : manifest.backups[who.i]!;
  const rName = manifest.recipient.name;

  // a countdown after wrong answers
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // wrong answers are counted for this tab, so a refresh does not reset the slow-down
  useEffect(() => {
    try {
      tries.current = JSON.parse(sessionStorage.getItem(`tabella.tries.${letter.id}`) ?? "{}");
    } catch {
      tries.current = {};
    }
    const w = tries.current[key] ?? 0;
    setWait(w > 1 ? Math.min(3, slowDown(w)) : 0);
    setMessage(null);
    setAnswer("");
  }, [key, letter.id]);

  async function submit() {
    if (busy || wait > 0 || !answer.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const seed = await unlockSeed(person.lock, answer, manifest.kdf);
      setIdentity(await identityFromCard(cardEncode(seed)));
      setMode(who.kind === "recipient" ? "open" : "choose");
    } catch (e) {
      if (e instanceof WrongAnswer) {
        const n = (tries.current[key] ?? 0) + 1;
        tries.current[key] = n;
        try {
          sessionStorage.setItem(`tabella.tries.${letter.id}`, JSON.stringify(tries.current));
        } catch {
          /* fine */
        }
        setMessage(KINDER[Math.min(n - 1, KINDER.length - 1)]!);
        setWait(slowDown(n + 1));
      } else setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (identity && mode === "open") return <LetterCard id={identity} first={letter} autoOpen />;
  if (identity && mode === "send")
    return (
      <m.section className="restore glass" {...cardAppear} aria-label="Send it">
        <h2>Send it to {rName}</h2>
        <p>This is {rName}'s opening card. It opens the letter, so send it only to {rName}, and delete the message afterwards.</p>
        <SharePanel
          label={`Send it to ${rName}`}
          copyWhat="text"
          content={{ subject: "Your opening card", text: `Here is your opening card for the letter that was left for you. Open ${window.location.origin}/open and paste this code:\n\n${identity.card}` }}
        />
        <button type="button" className="link" onClick={() => setMode("choose")}>
          Back
        </button>
      </m.section>
    );
  if (identity)
    return (
      <m.section className="restore glass" {...cardAppear} aria-label="How would you like to help?">
        <h2>Thank you, {person.name}.</h2>
        <p>That was right. How would you like to help {rName} receive it?</p>
        <div className="restore-actions stack">
          <Button arrow="forward" onClick={() => setMode("open")}>
            Open it with {rName}
          </Button>
          <Button variant="glass" onClick={() => setMode("send")}>
            Send it to {rName}
          </Button>
        </div>
      </m.section>
    );

  return (
    <m.section className="restore glass" {...cardAppear} aria-label="Your question">
      <h2>One question</h2>
      {manifest.backups.length > 0 && (
        <div className="who-pick" role="radiogroup" aria-label="Who are you?">
          <label className={`pick ${who.kind === "recipient" ? "on" : ""}`}>
            <input type="radio" name="who" checked={who.kind === "recipient"} onChange={() => setWho({ kind: "recipient" })} /> <span>I'm {rName}</span>
          </label>
          {manifest.backups.map((b, i) => (
            <label key={i} className={`pick ${who.kind === "backup" && who.i === i ? "on" : ""}`}>
              <input type="radio" name="who" checked={who.kind === "backup" && who.i === i} onChange={() => setWho({ kind: "backup", i })} /> <span>I'm {b.name}, helping {rName}</span>
            </label>
          ))}
        </div>
      )}
      <p className="question">{person.question}</p>
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      <Field>
        <input id="answer" type="text" value={answer} placeholder="Your answer" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
      </Field>
      <p className="status-line" role="status" aria-live="polite">
        {busy ? "Checking…" : message ? `${message}${wait > 0 ? ` (${wait})` : ""}` : ""}
      </p>
      <div className="restore-actions">
        <Button disabled={busy || wait > 0 || !answer.trim()} onClick={submit}>
          Open it
        </Button>
      </div>
    </m.section>
  );
}
