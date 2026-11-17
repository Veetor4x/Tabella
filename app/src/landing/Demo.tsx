import { AnimatePresence, m, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceCard } from "../ui/ChoiceCard";
import { Headline } from "../ui/Headline";
import { IconClock, IconLetter, IconShield, IconUser } from "../ui/icons";
import { EASE } from "../ui/motion";
import { PeopleMap } from "../ui/PeopleMap";
import { WaxSeal } from "../ui/WaxSeal";
import type { LetterView } from "../lib/registry";
import { CheckInView } from "../me/parts";
import { Reveal } from "./Reveal";
import { lettersAt, rhythmFor } from "./rhythm";

/**
 * The how-it-works walkthrough: the real screens, played inside a phone frame, with sample people.
 * One clock (step + milliseconds into the step) drives every screen, so play, pause and jumping all work.
 * The first six screens are the app's own screens (with sample data); the last two (time passing, Mia opening it)
 * are previews of screens that are still being built.
 */
export const STEPS = [
  { label: "Write", caption: "Alex writes a few honest lines, in Alex's own words.", ms: 7000 },
  { label: "People", caption: "Alex chooses who can read it. Each person turns Ready.", ms: 8000 },
  { label: "Guardian", caption: "A guardian can say “they're okay” if Alex goes quiet.", ms: 5500 },
  { label: "Timing", caption: "If Alex goes quiet for six months, the letter starts to open.", ms: 6000 },
  { label: "Seal", caption: "Sealed on the phone. Only Mia and Leo can open it.", ms: 11000 },
  { label: "I'm still here", caption: "One tap says “I'm still here” and starts the time again.", ms: 6000 },
  { label: "Time passes", caption: "Years pass. The check-ins stop, and the countdown runs out.", ms: 7000 },
  { label: "Mia opens it", caption: "Mia opens it. The seal cracks, and the letter is hers.", ms: 9500 },
] as const;

const LETTER = "Dear Mia and Leo,\n\nthe house papers are in the blue folder in my desk…\n\nBe kind to each other.\n\nLove, Alex";
const ADDRESS = "0xE6EB…6Ca3";

const at = (t: number, ms: number) => t >= ms;
const typed = (s: string, t: number, from: number, perChar = 55) => s.slice(0, Math.max(0, Math.floor((t - from) / perChar)));

function useDemoClock(running: boolean) {
  const [clock, setClock] = useState({ step: 0, t: 0 });
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setClock((c) => (c.t + 100 >= STEPS[c.step]!.ms ? { step: (c.step + 1) % STEPS.length, t: 0 } : { step: c.step, t: c.t + 100 })), 100);
    return () => clearInterval(id);
  }, [running]);
  return [clock, setClock] as const;
}

/* ---------- small pieces shared by the screens ---------- */
const Field = ({ value }: { value: string }) => (
  <div className="field">
    <input readOnly tabIndex={-1} value={value} />
  </div>
);
function Reveal2({ name, t, checkAt, readyAt }: { name: string; t: number; checkAt: number; readyAt: number }) {
  const checking = at(t, checkAt) && !at(t, readyAt);
  return (
    <div className="reveal" style={{ marginTop: 12 }}>
      <m.div className="reveal-ghost glass" initial={{ opacity: 0 }} animate={{ opacity: checking ? 1 : 0 }} transition={{ duration: 0.5 }}>
        <span className="sheen" />
      </m.div>
      <m.div className="reveal-card glass" initial={{ opacity: 0 }} animate={{ opacity: at(t, readyAt) ? 1 : 0 }} transition={{ duration: 0.5 }}>
        <span className="avatar">{name.charAt(0)}</span>
        <span className="reveal-text">
          <strong>{name}</strong>
          <span className="mono">{ADDRESS}</span>
        </span>
        <span className="badge ready">Ready</span>
      </m.div>
    </div>
  );
}
const Lead = ({ children }: { children: ReactNode }) => <p className="lead">{children}</p>;
const letterRoot = (
  <div className="letter-node glass">
    <span className="letter-ico">
      <IconLetter size={18} />
    </span>
    <span className="letter-quote">“Dear Mia and Leo,”</span>
    <WaxSeal className="mini-seal" />
  </div>
);

/* ---------- the eight screens ---------- */
const WRITE_RHYTHM = rhythmFor(LETTER);
function Write({ t }: { t: number }) {
  // the letter appears at an irregular, human pace (and follows the recorded key taps when there are some)
  const text = LETTER.slice(0, lettersAt(WRITE_RHYTHM, t - 900));
  return (
    <div className="step">
      <Headline text="What do you want them to *read* one day?" />
      <Lead>A few honest lines is enough. Say what you'd want them to know.</Lead>
      <div className="letter-wrap glass">
        <div className="demo-letter">
          {text}
          <span className="caret" />
        </div>
      </div>
    </div>
  );
}
function People({ t }: { t: number }) {
  const second = at(t, 4300);
  return (
    <div className="step">
      <Headline text="Alex, who should *read* this one day?" />
      <Lead>Choose up to three people. The letter is sealed just for them.</Lead>
      {second && <Reveal2 name="Mia" t={999999} checkAt={0} readyAt={0} />}
      <m.div key={second ? "b" : "a"} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <label>Their name</label>
        <Field value={typed(second ? "Leo" : "Mia", t - (second ? 4300 : 0), 700, 160)} />
        <label>Their address</label>
        <Field value={at(t - (second ? 4300 : 0), 1500) ? ADDRESS : ""} />
        <Reveal2 name={second ? "Leo" : "Mia"} t={t - (second ? 4300 : 0)} checkAt={2300} readyAt={3300} />
      </m.div>
    </div>
  );
}
function Guardian({ t }: { t: number }) {
  const on = at(t, 1600);
  return (
    <div className="step">
      <Headline text="Is there someone who can say you're *okay*?" />
      <Lead>A guardian is someone you trust. If you go quiet, they can tap “They're okay” to give you more time.</Lead>
      <div className="choices">
        <ChoiceCard name="dg" checked={on} onChange={() => {}} icon={<IconShield />} title="Add a guardian" sub="They can pause the countdown, up to twice." />
        <ChoiceCard name="dg" checked={!on} onChange={() => {}} icon={<IconUser />} title="Skip for now" sub="You can still check in yourself, any time." />
      </div>
      {on && (
        <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <label>Their name</label>
          <Field value={typed("Sofia", t, 2400, 180)} />
        </m.div>
      )}
    </div>
  );
}
function Timing({ t }: { t: number }) {
  const six = at(t, 2200);
  const p = six ? 0.5 : 1;
  return (
    <div className="step">
      <Headline text="If you go quiet, when should it *open*?" />
      <div className="timeline">
        <div className="track">
          <m.div className="track-fill" initial={false} animate={{ scaleX: p }} transition={{ duration: 0.9, ease: EASE }} />
          <m.div className="track-dot" initial={false} animate={{ x: `${p * 100}%` }} transition={{ duration: 0.9, ease: EASE }}>
            <span />
          </m.div>
        </div>
        <div className="ticks">
          <span>today</span>
          <span>3 mo</span>
          <span>6 mo</span>
          <span>12 mo</span>
        </div>
      </div>
      <div className="choices">
        <ChoiceCard name="dw" checked={false} onChange={() => {}} icon={<IconClock />} title="3 months" sub="of quiet, then a 14-day countdown" />
        <ChoiceCard name="dw" checked={six} onChange={() => {}} icon={<IconClock />} title="6 months" sub="of quiet, then a 14-day countdown" />
        <ChoiceCard name="dw" checked={!six} onChange={() => {}} icon={<IconClock />} title="12 months" sub="of quiet, then a 14-day countdown" />
      </div>
    </div>
  );
}
function SealScreen({ t }: { t: number }) {
  const working = at(t, 3200) && !at(t, 7000);
  const night = at(t, 8000);
  return night ? (
    <div className="done-screen" style={{ paddingTop: 30 }}>
      <Headline text="Sealed." />
      <m.p className="lead center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}>
        Only Mia and Leo can open this.
      </m.p>
      <PeopleMap
        variant="night"
        start={0.9}
        people={["Mia", "Leo"]}
        guardian="Sofia"
        root={
          <m.div className="seal-wrap" initial={{ opacity: 0, scale: 1.5, y: -18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.4, ease: EASE, delay: 0.4 }}>
            <WaxSeal />
          </m.div>
        }
      />
    </div>
  ) : (
    <div className="step">
      <Headline text="Ready to *seal* it?" />
      <Lead>One last look. Once it's sealed, nobody can change it.</Lead>
      <PeopleMap root={letterRoot} people={["Mia", "Leo"]} guardian="Sofia" variant="day" working={working} start={0.3} />
      <p className="status-line center">{working ? (t < 4600 ? "Checking everyone is ready…" : t < 5800 ? "Wrapping your letter…" : "Pressing the wax…") : ""}</p>
    </div>
  );
}
/** The real check-in screen (the same component as My letters), with a sample letter and a tap played for you. */
const DAY = 86400;
const SAMPLE_NOW = 1_800_000_000;
const sample = (lastCheckIn: number): LetterView => ({
  id: 7n, state: "Sealed", lastCheckIn, quiet: 180 * DAY, warning: 14 * DAY, nonce: 1, pausesUsed: 0, hasGuardian: true,
  heirs: ["0x1", "0x2"], ownerKeyHash: "0x01", guardianKeyHash: "0x02", chainNow: SAMPLE_NOW, fetchedAt: 0,
});
function StillHere({ t }: { t: number }) {
  const tapped = at(t, 2400);
  const phase = tapped ? "done" : at(t, 1600) ? "working" : "idle";
  return (
    <div className="step" style={{ paddingTop: 20 }}>
      <CheckInView view={sample(tapped ? SAMPLE_NOW : SAMPLE_NOW - 178 * DAY)} now={0} ownerName="Alex" phase={phase} onTap={() => {}} />
    </div>
  );
}
function TimePasses({ t }: { t: number }) {
  const spin = at(t, 600);
  const days = Math.round(Math.min(1, t / 5200) ** 0.8 * 760);
  const done = at(t, 5400);
  return (
    <div className="done-screen" style={{ paddingTop: 30 }}>
      <Headline text="Time passes." />
      <div className="clock" aria-hidden="true">
        <span className="clock-ring" />
        <m.span className="hand-h" initial={false} animate={{ rotate: spin ? 720 : 0 }} transition={{ duration: 5.2, ease: [0.5, 0, 0.2, 1] }} />
        <m.span className="hand-m" initial={false} animate={{ rotate: spin ? 8640 : 0 }} transition={{ duration: 5.2, ease: [0.5, 0, 0.2, 1] }} />
        <span className="clock-dot" />
      </div>
      <p className="clock-days">
        <strong>{done ? "Released" : `Day ${days}`}</strong>
        <span>{done ? "The countdown has run out. Mia and Leo are told." : "No check-in. The quiet period is running."}</span>
      </p>
    </div>
  );
}
function Open({ t }: { t: number }) {
  const cracked = at(t, 1700);
  const half = (side: "l" | "r") => (
    <m.span
      className="half"
      style={{ clipPath: side === "l" ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)" }}
      initial={false}
      animate={cracked ? { x: side === "l" ? -46 : 46, y: 34, rotate: side === "l" ? -24 : 24, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ duration: 1.3, ease: EASE }}
    >
      <WaxSeal />
    </m.span>
  );
  return (
    <div className="done-screen" style={{ paddingTop: 30 }}>
      <Headline text="Mia, this is for you." />
      <div className="open-seal">
        <m.span className="open-light" aria-hidden="true" initial={false} animate={cracked ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.3 }} transition={{ duration: 1.4, ease: EASE }} />
        {Array.from({ length: 9 }, (_, i) => (
          <m.span key={i} className="open-ray" aria-hidden="true" style={{ rotate: -80 + i * 20 }} initial={false} animate={cracked ? { opacity: [0, 0.9, 0.35], scaleY: [0.2, 1.1, 0.9] } : { opacity: 0, scaleY: 0.2 }} transition={{ duration: 1.6, ease: EASE, delay: 0.1 + i * 0.04 }} />
        ))}
        {half("l")}
        {half("r")}
        <m.span className="crack" initial={false} animate={{ opacity: at(t, 1300) && !cracked ? 1 : 0 }} transition={{ duration: 0.3 }} />
      </div>
      <m.div className="open-letter glass" initial={false} animate={at(t, 2900) ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }} transition={{ duration: 1, ease: EASE }}>
        {LETTER.split("\n\n").map((l, i) => (
          <m.p key={i} initial={false} animate={{ opacity: at(t, 3400 + i * 900) ? 1 : 0, y: at(t, 3400 + i * 900) ? 0 : 6 }} transition={{ duration: 0.6 }}>
            {l}
          </m.p>
        ))}
      </m.div>
    </div>
  );
}
export const SCREENS = [Write, People, Guardian, Timing, SealScreen, StillHere, TimePasses, Open];

/* ---------- the phone and the controls ---------- */
/** The phone frame with the current screen in it. `t` drives the screen; `shownT` is what it shows (a finished moment when still). */
export function PhoneView({ step, t, shownT, still, veilOn }: { step: number; t: number; shownT: number; still: boolean; veilOn: boolean }) {
  const phone = useRef<HTMLDivElement>(null);
  useEffect(() => phone.current?.setAttribute("inert", ""), []);
  const night = step >= 5 || (step === 4 && at(shownT, 8000));
  const Screen = SCREENS[step]!;
  void t;
  return (
    <div className={`phone ${still ? "still" : ""}`}>
      <span className="phone-notch" />
      <div ref={phone} className={`phone-screen ${night ? "night" : "day"}`} aria-hidden="true">
        <div className="phone-bg" />
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step} className="phone-page" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.45, ease: EASE }}>
            <Screen t={shownT} />
          </m.div>
        </AnimatePresence>
        <m.div className="phone-veil" initial={false} animate={{ opacity: veilOn ? 1 : 0 }} transition={{ duration: 1 }} />
      </div>
    </div>
  );
}

export function Demo() {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.35 });
  const [paused, setPaused] = useState(false); // chosen by the visitor
  const [playedByChoice, setPlayed] = useState(false); // reduced motion: only plays if the visitor presses play
  const [hidden, setHidden] = useState(false);
  const running = !!inView && !paused && !hidden && (!calm || playedByChoice);
  const [{ step, t }, setClock] = useDemoClock(running);

  useEffect(() => {
    const f = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  // reduced motion: each screen is shown at its finished moment until the visitor presses play
  const shownT = calm && !playedByChoice ? STEPS[step]!.ms - 100 : t;
  const veil = step === 4 && t >= 7000 && t < 8400 && !(calm && !playedByChoice);

  const jump = (i: number) => {
    setClock({ step: i, t: 0 });
  };
  const toggle = () => {
    if (calm && !playedByChoice) {
      setPlayed(true);
      setPaused(false);
    } else setPaused((p) => !p);
  };

  return (
    <section className="land-section" id="how" ref={box}>
      <p className="eyebrow">How it works</p>
      <Headline text="A letter's whole life, in *one minute*." as="h2" inView className="h2" />
      <Reveal>
        <div className="demo">
          <div className="phone-wrap">
            <PhoneView step={step} t={t} shownT={shownT} still={!running} veilOn={veil} />
          </div>
          <p className="demo-caption" aria-live="polite">
            <span className="demo-num">{String(step + 1).padStart(2, "0")}</span>
            {STEPS[step]!.caption}
          </p>
          <div className="demo-ctrl">
            <div className="demo-controls">
              <button type="button" className="btn glass play" onClick={toggle} aria-label={running ? "Pause the demo" : "Play the demo"}>
                <span aria-hidden="true">{running ? "Pause" : "Play"}</span>
              </button>
              <span className="demo-note">{calm ? "Step through it, or press play." : "Plays by itself. Tap a step to jump."}</span>
            </div>
            <ol className="demo-steps">
              {STEPS.map((s, i) => (
                <li key={s.label}>
                  <button type="button" className={`demo-step ${i === step ? "on" : ""}`} onClick={() => jump(i)} aria-current={i === step ? "step" : undefined}>
                    <span className="demo-step-n">{String(i + 1).padStart(2, "0")}</span>
                    <span>{s.label}</span>
                    <span className="demo-step-bar" aria-hidden="true">
                      <m.span initial={false} animate={{ scaleX: i < step ? 1 : i === step ? Math.min(1, t / s.ms) : 0 }} transition={{ duration: 0.12, ease: "linear" }} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <p className="demo-fine">A preview with sample people. The first six screens are the real ones; time passing and opening are still being built.</p>
        </div>
      </Reveal>
    </section>
  );
}
