import { AnimatePresence, m, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceCard } from "../ui/ChoiceCard";
import { Headline } from "../ui/Headline";
import { IconClock, IconLetter, IconShield, IconUser } from "../ui/icons";
import { EASE } from "../ui/motion";
import { PeopleMap } from "../ui/PeopleMap";
import { PersonFields } from "../steps/SurpriseForm";
import { WaxSeal } from "../ui/WaxSeal";
import type { LetterView } from "../lib/registry";
import { CheckInView } from "../me/parts";
import { HeirStateView, Panel } from "../open/OpenPage";
import { DEMO_SHEET, Story } from "./stories";
import { Reveal } from "./Reveal";
import { fitRhythm, lettersAt, rhythmFor } from "./rhythm";

/**
 * The how-it-works walkthrough: the real screens, played inside a phone frame, with sample people.
 * One clock (step + milliseconds into the step) drives every screen, so play, pause and jumping all work.
 * Every screen is the app's own (with sample people): the owner's flow, the check-in screen, the "your letter has
 * opened" screen, and the loved one's /open screens, with the real envelope scene.
 */
export const STEPS = [
  { label: "Write", caption: "Alex writes a few honest lines, in Alex's own words.", ms: 12000 },
  { label: "People", caption: "Alex chooses who can read it. Each person turns Ready.", ms: 8000 },
  { label: "Guardian", caption: "A guardian can say “they're okay” if Alex goes quiet.", ms: 5500 },
  { label: "Timing", caption: "If Alex goes quiet for six months, the letter starts to open.", ms: 6000 },
  { label: "Seal", caption: "Sealed on the phone. Only Mia and Leo can open it.", ms: 11000 },
  { label: "I'm still here", caption: "One tap says “I'm still here” and starts the time again.", ms: 6000 },
  { label: "Time passes", caption: "Years pass. The check-ins stop, and the countdown runs out.", ms: 7000 },
  { label: "Mia opens it", caption: "Mia opens it. The seal cracks, and the letter is hers.", ms: 13500 },
] as const;

/** The "Keep it a surprise" walkthrough: the owner's flow with how-to-reach-them, the ladder, and the question. */
export const STEPS_SURPRISE = [
  { label: "Write", caption: "Alex writes a few honest lines, in Alex's own words.", ms: 12000 },
  { label: "Reach them", caption: "Alex adds how to reach Mia, and a question only Mia can answer.", ms: 9000 },
  { label: "Backup", caption: "Alex adds someone Mia trusts, in case Mia can't be reached.", ms: 7000 },
  { label: "Timing", caption: "If Alex goes quiet for six months, the letter starts to open.", ms: 6000 },
  { label: "Seal", caption: "Sealed on the phone. Only Mia can open it.", ms: 11000 },
  { label: "I'm still here", caption: "One tap says “I'm still here” and starts the time again.", ms: 6000 },
  { label: "Time passes", caption: "Years pass. The check-ins stop, and the countdown runs out.", ms: 7000 },
  { label: "Found", caption: "Tabella finds Mia by email and message, then a call, then asks the backup to help.", ms: 9000 },
  { label: "They open it", caption: "Mia answers the question only Mia knows, and the letter opens.", ms: 14500 },
] as const;

/** The demo letter. No recovery words, no codes, no amounts: it only says where things are and who can help. */
export const LETTER =
  "Dear Mia and Leo,\n\nI've put aside 2 Bitcoin for you both, my gift for your futures. The hardware wallet is in the small safe in my study, and its recovery card is sealed with Mr. Hart, our lawyer. Show him this letter and he'll help you. Split it fairly and look after each other.\n\nAll my love, Alex.";
const ADDRESS = "0xE6EB…6Ca3";

const at = (t: number, ms: number) => t >= ms;
const typed = (s: string, t: number, from: number, perChar = 55) => s.slice(0, Math.max(0, Math.floor((t - from) / perChar)));

function useDemoClock(running: boolean, steps: readonly { ms: number }[]) {
  const [clock, setClock] = useState({ step: 0, t: 0 });
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setClock((c) => (c.t + 100 >= (steps[c.step]?.ms ?? 1e9) ? { step: (c.step + 1) % steps.length, t: 0 } : { step: c.step, t: c.t + 100 })), 100);
    return () => clearInterval(id);
  }, [running, steps]);
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
export const WRITE_TYPING_MS = 9600;
const WRITE_RHYTHM = fitRhythm(rhythmFor(LETTER), WRITE_TYPING_MS);
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
  released: false, heirs: ["0x1", "0x2"], ownerKeyHash: "0x01", guardianKeyHash: "0x02", chainNow: SAMPLE_NOW, fetchedAt: 0,
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
/** Time passes: the app's own check-in screen, nobody taps, the quiet time runs out and it says the letter has opened. */
function TimePasses({ t }: { t: number }) {
  const opened = at(t, 4600);
  const base = sample(SAMPLE_NOW - (180 + 13) * DAY); // the last days of the countdown: the app's urgent look
  const view: LetterView = opened ? { ...base, state: "Opened", released: true } : { ...base, state: "Warning" };
  return (
    <div className="step" style={{ paddingTop: 20 }}>
      <CheckInView view={view} now={0} ownerName="Alex" phase="idle" onTap={() => {}} />
    </div>
  );
}
/** Mia opens it: the same screens as /open (on its way, here, the envelope opening and the zoom). */
function Open({ t }: { t: number }) {
  const ready = at(t, 2600);
  const pressed = at(t, 3800);
  const scene = at(t, 4200);
  return (
    <div className="step" style={{ paddingTop: 14 }}>
      <Headline text="Your *letter*." />
      {scene ? (
        <div className="letter-open">
          <Panel>
            <Story id="open" lines={DEMO_SHEET} />
          </Panel>
        </div>
      ) : (
        <HeirStateView state={ready ? "ready" : "on-its-way"} pressed={pressed} onOpen={() => {}} />
      )}
    </div>
  );
}
export const SCREENS = [Write, People, Guardian, Timing, SealScreen, StillHere, TimePasses, Open];

/* ---------- the "keep it a surprise" screens ---------- */
const DEMO_Q = "What did we call the little boat?";
const noop = () => {};
function Reach({ t }: { t: number }) {
  return (
    <div className="step" style={{ paddingTop: 14 }}>
      {/* the top of the screen scrolls away as the question and answer are typed */}
      <m.div initial={false} animate={{ opacity: at(t, 5200) ? 0 : 1 }} transition={{ duration: 0.8 }}>
        <Headline text="Alex, who should *read* this one day?" />
        <div className="choices" aria-hidden="true">
          <ChoiceCard name="demo-mode" checked onChange={noop} icon={<IconLetter />} title="Keep it a surprise" sub="We find them when the time comes." />
          <ChoiceCard name="demo-mode" checked={false} onChange={noop} icon={<IconUser />} title="Invite someone" sub="They make their own card first." />
        </div>
      </m.div>
      <m.div initial={false} animate={{ y: at(t, 5200) ? -300 : 0 }} transition={{ duration: 1.2, ease: EASE }}>
        <PersonFields id="demo-r" kind="recipient" heading="Who is it for?" showProblem={false} onChange={noop} p={{ name: typed("Mia", t, 700, 160), email: typed("mia@example.com", t, 1300, 55), phone: typed("+44 7700 900123", t, 2300, 70), question: typed(DEMO_Q, t, 3300, 40), answer: typed("Blue Heron", t, 5400, 110), relation: "" }} />
      </m.div>
    </div>
  );
}
function Backup({ t }: { t: number }) {
  return (
    <div className="step" style={{ paddingTop: 14 }}>
      <m.div initial={false} animate={{ opacity: at(t, 4600) ? 0 : 1 }} transition={{ duration: 0.8 }}>
        <Headline text="Someone *you trust*." />
        <Lead>If Mia can't be reached, they can help.</Lead>
      </m.div>
      <m.div initial={false} animate={{ y: at(t, 4600) ? -190 : 0 }} transition={{ duration: 1.2, ease: EASE }}>
        <PersonFields id="demo-b" kind="backup" heading="Backup person 1" showProblem={false} onChange={noop} p={{ name: typed("Sofia", t, 500, 150), relation: typed("her oldest friend", t, 1100, 60), email: typed("sofia@example.com", t, 2100, 55), phone: typed("+44 7700 900456", t, 3000, 60), question: typed("Where did we first meet?", t, 4000, 40), answer: "", }} />
      </m.div>
    </div>
  );
}
function Found({ t }: { t: number }) {
  const row = (at_: number, label: string, text: string, key: string) => (
    <m.li key={key} className="found-row glass" initial={false} animate={{ opacity: at(t, at_) ? 1 : 0, y: at(t, at_) ? 0 : 12 }} transition={{ duration: 0.6, ease: EASE }}>
      <strong>{label}</strong>
      <span>{text}</span>
    </m.li>
  );
  return (
    <div className="done-screen" style={{ paddingTop: 26 }}>
      <Headline text="Tabella finds *Mia*." />
      <ol className="found">
        {row(900, "Email and message", "“Alex left you a letter. It's been kept safe until now.”", "a")}
        {row(3000, "No answer? A call", "A short, calm message, and a gentle reminder.", "b")}
        {row(5200, "Still no answer? The backup", "“Alex left a letter for Mia and asked you to help them receive it.”", "c")}
      </ol>
    </div>
  );
}
function OpenQ({ t }: { t: number }) {
  const scene = at(t, 5200);
  const typedAnswer = typed("blue heron", t, 1200, 120);
  return (
    <div className="step" style={{ paddingTop: 14 }}>
      <Headline text="Your *letter*." />
      {scene ? (
        <div className="letter-open">
          <Panel>
            <Story id="open" lines={DEMO_SHEET} />
          </Panel>
        </div>
      ) : (
        <section className="restore glass" aria-hidden="true">
          <h2>One question</h2>
          <p className="question">{DEMO_Q}</p>
          <Field value={typedAnswer} />
          <div className="restore-actions">
            <span className={`btn primary ${at(t, 3800) ? "pressed" : ""}`}>Open it</span>
          </div>
        </section>
      )}
    </div>
  );
}
export const SCREENS_SURPRISE = [Write, Reach, Backup, Timing, SealScreen, StillHere, TimePasses, Found, OpenQ];


/* ---------- the phone and the controls ---------- */
/** The phone frame with the current screen in it. `t` drives the screen; `shownT` is what it shows (a finished moment when still). */
export function PhoneView({ step, t, shownT, still, veilOn, set = "invite" }: { step: number; t: number; shownT: number; still: boolean; veilOn: boolean; set?: "invite" | "surprise" }) {
  const phone = useRef<HTMLDivElement>(null);
  useEffect(() => phone.current?.setAttribute("inert", ""), []);
  const night = step >= 5 || (step === 4 && at(shownT, 8000));
  const Screen = (set === "surprise" ? SCREENS_SURPRISE : SCREENS)[step]!;
  void t;
  return (
    <div className={`phone ${still ? "still" : ""}`}>
      <span className="phone-notch" />
      <div ref={phone} className={`phone-screen ${night ? "night" : "day"}`} aria-hidden="true">
        <div className="phone-bg" />
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={`${set}-${step}`} className="phone-page" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.45, ease: EASE }}>
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
  const [variant, setVariant] = useState<"surprise" | "invite">("surprise"); // the two ways to hand a letter over
  const steps = variant === "surprise" ? STEPS_SURPRISE : STEPS;
  const [{ step, t }, setClock] = useDemoClock(running, steps);

  useEffect(() => {
    const f = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  // reduced motion: each screen is shown at its finished moment until the visitor presses play
  const shownT = calm && !playedByChoice ? steps[step]!.ms - 100 : t;
  const veil = step === 4 && t >= 7000 && t < 8400 && !(calm && !playedByChoice);

  const jump = (i: number) => {
    setClock({ step: i, t: 0 });
  };
  const choose = (v: "surprise" | "invite") => {
    setVariant(v);
    setClock({ step: 0, t: 0 });
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
          <div className="demo-tabs" role="tablist" aria-label="Two ways to hand a letter over">
            <button type="button" role="tab" aria-selected={variant === "surprise"} className={`demo-tab ${variant === "surprise" ? "on" : ""}`} onClick={() => choose("surprise")}>
              Keep it a surprise
            </button>
            <button type="button" role="tab" aria-selected={variant === "invite"} className={`demo-tab ${variant === "invite" ? "on" : ""}`} onClick={() => choose("invite")}>
              Invite them
            </button>
          </div>
          <div className="phone-wrap">
            <PhoneView set={variant} step={step} t={t} shownT={shownT} still={!running} veilOn={veil} />
          </div>
          <p className="demo-caption" aria-live="polite">
            <span className="demo-num">{String(step + 1).padStart(2, "0")}</span>
            {steps[step]!.caption}
          </p>
          <div className="demo-ctrl">
            <div className="demo-controls">
              <button type="button" className="btn glass play" onClick={toggle} aria-label={running ? "Pause the demo" : "Play the demo"}>
                <span aria-hidden="true">{running ? "Pause" : "Play"}</span>
              </button>
              <span className="demo-note">{calm ? "Step through it, or press play." : "Plays by itself. Tap a step to jump."}</span>
            </div>
            <ol className="demo-steps">
              {steps.map((s, i) => (
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
          <p className="demo-fine">Sample people, the real screens.</p>
        </div>
      </Reveal>
    </section>
  );
}
