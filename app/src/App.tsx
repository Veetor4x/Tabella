import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { warmUp } from "./lib/helper";
import { whenById } from "./lib/periods";
import { clearDraft, emptyDraft, loadDraft, saveDraft, saveLetter, type Draft, type SealedLetter } from "./lib/storage";
import { DoneScreen } from "./steps/DoneScreen";
import { GuardianStep } from "./steps/GuardianStep";
import { SealStep } from "./steps/SealStep";
import { WhenStep } from "./steps/WhenStep";
import { WhoStep } from "./steps/WhoStep";
import { WriteStep } from "./steps/WriteStep";
import { Background } from "./ui/Background";
import { CeremonyContext, type CeremonyApi, type CeremonyState } from "./ui/ceremony";
import { stepVariants } from "./ui/motion";
import { ProgressDots } from "./ui/ProgressDots";
import { SealCeremony } from "./ui/SealCeremony";
import { SoundToggle } from "./ui/SoundToggle";
import { joinNames } from "./ui/steps";
import { WaxSeal } from "./ui/WaxSeal";

export function App() {
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? emptyDraft());
  const [step, setStep] = useState(0);
  const dir = useRef(1); // 1 = going forward, -1 = going back: the screens slide differently
  const [sealed, setSealed] = useState<SealedLetter | null>(null);
  const [ceremony, setCeremony] = useState<CeremonyState | null>(null);

  // Wake the Postman now: by the time the letter is written it is up.
  useEffect(() => {
    warmUp().catch(() => {});
  }, []);
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const next = () => {
    dir.current = 1;
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    dir.current = -1;
    setStep((s) => Math.max(0, s - 1));
  };

  const onSealed = useCallback((letter: SealedLetter) => {
    saveLetter(letter);
    clearDraft();
    dir.current = 1;
    setSealed(letter);
  }, []);

  function another() {
    dir.current = -1;
    setSealed(null);
    setDraft(emptyDraft());
    setStep(0);
  }

  const ceremonyApi = useMemo<CeremonyApi>(
    () => ({
      show: (s) => setCeremony(s),
      update: (p) => setCeremony((c) => (c ? { ...c, ...p } : c)),
      hide: () => setCeremony(null),
    }),
    [],
  );

  const screen = sealed ? (
    <DoneScreen letter={sealed} onAnother={another} />
  ) : step === 0 ? (
    <WriteStep text={draft.text} onChange={(text) => patch({ text })} onNext={next} />
  ) : step === 1 ? (
    <WhoStep heirs={draft.heirs} onChange={(heirs) => patch({ heirs })} onBack={back} onNext={next} />
  ) : step === 2 ? (
    <GuardianStep guardian={draft.guardian} onChange={(guardian) => patch({ guardian })} onBack={back} onNext={next} />
  ) : step === 3 ? (
    <WhenStep when={draft.when} names={joinNames(draft.heirs.map((h) => h.name))} onChange={(when) => patch({ when })} onBack={back} onNext={next} />
  ) : (
    <SealStep draft={{ ...draft, when: whenById(draft.when).id }} onBack={back} onSealed={onSealed} />
  );

  return (
    // reducedMotion="user": people who ask their device for less motion get a calm version (fades, no movement)
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <CeremonyContext.Provider value={ceremonyApi}>
          <Background />
          <div className="app">
            <header className="brand">
              <div className="brand-text">
                <span className="brand-name">
                  <WaxSeal /> Tabella
                </span>
                <span className="brand-tag">Sealed today. Opened when it matters.</span>
              </div>
              <SoundToggle />
            </header>
            <main>
              {!sealed && <ProgressDots step={step} />}
              <AnimatePresence mode="wait" custom={dir.current} initial={false}>
                <m.div key={sealed ? "done" : step} className="screen" custom={dir.current} variants={stepVariants} initial="enter" animate="center" exit="exit">
                  {screen}
                </m.div>
              </AnimatePresence>
            </main>
            <footer>A demo on a test network. Please don't write real secrets yet.</footer>
          </div>
          <AnimatePresence>{ceremony && <SealCeremony key="ceremony" {...ceremony} />}</AnimatePresence>
        </CeremonyContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}
