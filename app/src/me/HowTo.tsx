import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { CardKind } from "../lib/cards";

const STEPS: Record<CardKind, string[]> = {
  owner: ["Find your I'm-still-here card. It's the one you printed or saved when you sealed your letter.", "Scan its code, or type it in on this page.", "You'll see your letters. Tap “I'm still here” every so often."],
  guardian: ["Find the guardian card they gave you.", "Scan its code, or type it in on this page.", "You'll see one button: “They're okay”. Tap it only if you know they are."],
  opening: ["Find your opening card, or the link in the email you were sent.", "Open the link, or scan the card's code, or type it in on this page.", "Your letter will be waiting. If it asks a question, answer it, and the letter opens."],
};
export const HOWTO_TITLE: Record<CardKind, string> = { owner: "I wrote a letter", guardian: "Someone asked me to look after their letter", opening: "Someone left me a letter" };
const MS = 4200;

const an = (name: string, delay = 0, dur = 0.8) => ({ animation: `${name} ${dur}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s backwards` });

function Qrish({ x, y, s = 7 }: { x: number; y: number; s?: number }) {
  const cells = [1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1];
  return (
    <g>
      {cells.map((c, i) => (c ? <rect key={i} className="wx2" x={x + (i % 5) * s} y={y + Math.floor(i / 5) * s} width={s - 1.5} height={s - 1.5} /> : null))}
    </g>
  );
}

function Scene({ kind, step }: { kind: CardKind; step: number }) {
  if (step === 0)
    return (
      <g key="s0">
        <g style={an("rise")}>
          <rect className="sk" x="90" y="140" width="180" height="116" rx="10" />
          <Qrish x={106} y={160} s={9} />
          <path className="sk soft" d="M176 168h80M176 188h60M176 208h70" />
          <circle className="wx" cx="236" cy="236" r="9" style={an("pop", 0.5)} />
        </g>
      </g>
    );
  if (step === 1)
    return (
      <g key="s1">
        <rect className="sk" x="124" y="96" width="112" height="200" rx="16" style={an("rise")} />
        <path className="sk soft" d="M150 112h60" />
        <g style={an("pop", 0.3)}>
          <path className="sk" d="M146 150v-12h12M214 150v-12h-12M146 214v12h12M214 214v12h-12" />
          <Qrish x={152} y={158} s={8} />
        </g>
        <rect className="scanline" x="146" y="152" width="68" height="2" />
        <rect className="sk soft" x="136" y="252" width="88" height="22" rx="8" style={an("rise", 0.9)} />
        <path className="sk soft" d="M146 263h40" style={an("wipe", 1.2)} />
      </g>
    );
  return (
    <g key="s2" style={an("rise")}>
      {kind === "opening" ? (
        <g>
          <rect className="letter-sheet" x="120" y="132" width="120" height="96" rx="2" style={an("rise", 0.7, 1.1)} />
          <path className="ln" d="M136 154h88M136 168h88M136 182h70" style={an("wipe", 1.2)} />
          <path className="sk" d="M96 206h168v84H96z M96 290l54-42M264 290l-54-42M96 206l84 52 84-52" />
          <circle className="wx" cx="180" cy="258" r="11" />
        </g>
      ) : kind === "guardian" ? (
        <g>
          <rect className="wxbtn" x="92" y="196" width="176" height="52" rx="26" />
          <text className="btnT" x="180" y="228" textAnchor="middle">They're okay</text>
          <path className="tick" d="M160 150l14 14 28-30" style={an("wipe", 0.8)} />
        </g>
      ) : (
        <g>
          <circle className="sk" cx="180" cy="180" r="64" />
          <path className="tick" d="M154 180l18 18 34-38" style={an("wipe", 0.7)} />
          <rect className="wxbtn" x="108" y="270" width="144" height="42" rx="21" style={an("rise", 0.9)} />
          <text className="btnT" x="180" y="297" textAnchor="middle">I'm still here</text>
        </g>
      )}
    </g>
  );
}

/** A short animated how-to, intro style: three steps, captions only. It plays by itself and can be stepped through by hand. */
export function HowTo({ kind, onClose }: { kind: CardKind; onClose: () => void }) {
  const calm = useReducedMotion();
  const [step, setStep] = useState(0);
  const steps = STEPS[kind];
  useEffect(() => {
    if (calm) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % steps.length), MS);
    return () => clearTimeout(t);
  }, [step, calm, steps.length]);
  return (
    <section className="howto glass" aria-label={`How to: ${HOWTO_TITLE[kind]}`}>
      <div className="howto-segs" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <svg className="story howto-art" viewBox="0 0 360 420" role="img" aria-label={`Step ${step + 1} of ${steps.length}`}>
        <Scene kind={kind} step={step} />
      </svg>
      <p className="howto-cap" role="status" aria-live="polite">
        <strong>{step + 1}.</strong> {steps[step]}
      </p>
      <div className="howto-nav">
        <button type="button" className="link" onClick={() => setStep((s) => (s + steps.length - 1) % steps.length)}>
          Back
        </button>
        <button type="button" className="link" onClick={() => setStep((s) => (s + 1) % steps.length)}>
          Next
        </button>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
