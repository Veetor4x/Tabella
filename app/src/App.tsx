import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { warmUp } from "./lib/helper";
import { whenById } from "./lib/periods";
import { clearDraft, emptyDraft, loadDraft, saveDraft, saveLetter, type Draft, type SealedLetter } from "./lib/storage";
import { DoneScreen } from "./steps/DoneScreen";
import { GuardianStep } from "./steps/GuardianStep";
import { SealStep } from "./steps/SealStep";
import { WhenStep } from "./steps/WhenStep";
import { PeopleStep } from "./steps/PeopleStep";
import { WriteStep } from "./steps/WriteStep";
import { Background } from "./ui/Background";
import { screenTransition, screenVariants, veilTransition } from "./ui/motion";
import { Numeral } from "./ui/Numeral";
import { Pills } from "./ui/Pills";
import { SoundWave } from "./ui/SoundWave";
import { ThemeToggle } from "./ui/ThemeToggle";
import { STEP_COUNT, countWords, joinNames } from "./ui/steps";

const demoFromUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

export function App() {
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? emptyDraft());
  const [step, setStep] = useState(0);
  const dir = useRef(1); // 1 = going forward, -1 = going back: the screens slide differently
  const [sealed, setSealed] = useState<SealedLetter | null>(null);
  const [veil, setVeil] = useState(false); // the dark veil that carries the screen into night
  const [taps, setTaps] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Wake the Postman now: by the time the letter is written it is up.
  useEffect(() => {
    warmUp().catch(() => {});
  }, []);
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const next = () => {
    dir.current = 1;
    setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
  };
  const back = () => {
    dir.current = -1;
    setStep((s) => Math.max(0, s - 1));
  };

  const onSealed = useCallback((letter: SealedLetter) => {
    // Keep the cards first, before any animation: nothing can lose them.
    saveLetter(letter);
    clearDraft();
    dir.current = 1;
    setVeil(true); // fade the day screen out to night...
    timers.current.push(
      setTimeout(() => {
        setSealed(letter); // ...swap while it is fully dark...
        setVeil(false); // ...and let the night screen fade in
      }, 1300),
    );
  }, []);

  function another() {
    dir.current = -1;
    setVeil(true);
    timers.current.push(
      setTimeout(() => {
        setSealed(null);
        setDraft(emptyDraft());
        setStep(0);
        setVeil(false);
      }, 900),
    );
  }

  const demo = demoFromUrl() || taps >= 5;
  const owner = draft.owner ?? "";
  const words = countWords(draft.text);
  const pills: { key: string; label: string }[] = [];
  if (!sealed) {
    if (step >= 1) pills.push({ key: "letter", label: `Letter · ${words} ${words === 1 ? "word" : "words"}` });
    if (step >= 2) {
      const surprise = (draft.mode ?? "surprise") === "surprise";
      const nb = draft.backups?.length ?? 0;
      pills.push({ key: "people", label: surprise ? `${draft.recipient?.name.trim() || "Someone"} · surprise${nb ? ` + ${nb} backup${nb === 1 ? "" : "s"}` : ""}` : `${draft.heirs.length} ${draft.heirs.length === 1 ? "person" : "people"}` });
    }
    if (step >= 3) pills.push({ key: "guardian", label: draft.guardian?.name.trim() ? `${draft.guardian.name.trim()} · guardian` : "No guardian" });
    if (step >= 4) pills.push({ key: "when", label: whenById(draft.when).label });
  }

  const screen = sealed ? (
    <DoneScreen letter={sealed} onAnother={another} />
  ) : step === 0 ? (
    <WriteStep text={draft.text} owner={owner} onChange={(text) => patch({ text })} onOwner={(o) => patch({ owner: o })} onNext={next} />
  ) : step === 1 ? (
    <PeopleStep draft={draft} owner={owner} patch={patch} onBack={back} onNext={next} />
  ) : step === 2 ? (
    <GuardianStep guardian={draft.guardian} onChange={(guardian) => patch({ guardian })} onBack={back} onNext={next} />
  ) : step === 3 ? (
    <WhenStep when={draft.when} demo={demo} names={(draft.mode ?? "surprise") === "surprise" ? draft.recipient?.name.trim() ?? "" : joinNames(draft.heirs.map((h) => h.name))} onChange={(when) => patch({ when })} onBack={back} onNext={next} />
  ) : (
    <SealStep draft={{ ...draft, when: whenById(draft.when).id }} onBack={back} onSealed={onSealed} />
  );

  return (
    // reducedMotion="user": people who ask their device for less motion get a calm version (fades, no movement)
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className={`root ${sealed ? "night" : ""}`}>
          <Background />
          <div className="app">
            <header className="brand">
              <div className="brand-text">
                <a className="brand-name" href="/" aria-label="Tabella, home">Tabella</a>
                <span className="brand-tag">Sealed today. Opened when it matters.</span>
              </div>
              <div className="head-tools">
                <ThemeToggle />
                <SoundWave />
              </div>
            </header>
            <main>
              {!sealed && (
                <>
                  <Numeral step={step} onTap={() => setTaps((t) => t + 1)} />
                  <Pills items={pills} />
                </>
              )}
              <AnimatePresence mode="wait" custom={dir.current} initial={false}>
                <m.div key={sealed ? "done" : step} className="screen" custom={dir.current} variants={screenVariants} transition={screenTransition} initial="enter" animate="center" exit="exit">
                  {screen}
                </m.div>
              </AnimatePresence>
            </main>
            <footer>A demo on a test network. Please don't write real secrets yet.</footer>
          </div>
          <m.div className="veil" aria-hidden="true" initial={false} animate={{ opacity: veil ? 1 : 0 }} transition={veilTransition} style={{ pointerEvents: veil ? "auto" : "none" }} />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
