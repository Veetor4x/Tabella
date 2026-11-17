import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { warmUp } from "./lib/helper";
import { longDay, releaseAtFor, whenById } from "./lib/periods";
import { clearDraft, emptyDraft, loadDraft, saveDraft, saveLetter, type Draft, type SealedLetter } from "./lib/storage";
import { DoneScreen } from "./steps/DoneScreen";
import { GuardianStep } from "./steps/GuardianStep";
import { SealStep } from "./steps/SealStep";
import { WhenStep } from "./steps/WhenStep";
import { PeopleStep } from "./steps/PeopleStep";
import { WriteStep } from "./steps/WriteStep";
import { Background } from "./ui/Background";
import { Notices } from "./ui/Notices";
import { screenTransition, screenVariants, veilTransition } from "./ui/motion";
import { Numeral } from "./ui/Numeral";
import { Pills } from "./ui/Pills";
import { SoundWave } from "./ui/SoundWave";
import { ThemeToggle } from "./ui/ThemeToggle";
import { countWords, joinNames } from "./ui/steps";

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
  // Write, People, When, then Guardian (only if it opens when Alex goes quiet), then Seal. A dated letter has no guardian and no check-ins.
  const dated = draft.whenMode === "date";
  const order = dated ? (["write", "people", "when", "seal"] as const) : (["write", "people", "when", "guardian", "seal"] as const);
  const count = order.length;
  const name = order[Math.min(step, count - 1)]!;
  const next = () => {
    dir.current = 1;
    setStep((s) => Math.min(count - 1, s + 1));
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
  const at = dated && draft.releaseDay ? releaseAtFor(draft.releaseDay) : null;
  const whenLabel = dated ? (draft.dateDemo ? "In 2 minutes (demo)" : at ? `Opens ${longDay(at)}` : "On a date") : whenById(draft.when).label;
  if (!sealed) {
    const pos = (n: string) => order.indexOf(n as never);
    if (step > pos("write")) pills.push({ key: "letter", label: `Letter · ${words} ${words === 1 ? "word" : "words"}` });
    if (step > pos("people")) {
      const surprise = (draft.mode ?? "surprise") === "surprise";
      const nb = draft.backups?.length ?? 0;
      pills.push({ key: "people", label: surprise ? `${draft.recipient?.name.trim() || "Someone"} · surprise${nb ? ` + ${nb} backup${nb === 1 ? "" : "s"}` : ""}` : `${draft.heirs.length} ${draft.heirs.length === 1 ? "person" : "people"}` });
    }
    if (step > pos("when")) pills.push({ key: "when", label: whenLabel });
    if (!dated && step > pos("guardian")) pills.push({ key: "guardian", label: draft.guardian?.name.trim() ? `${draft.guardian.name.trim()} · guardian` : "No guardian" });
  }

  const peopleNames = (draft.mode ?? "surprise") === "surprise" ? draft.recipient?.name.trim() ?? "" : joinNames(draft.heirs.map((h) => h.name));
  const screen = sealed ? (
    <DoneScreen letter={sealed} onAnother={another} />
  ) : name === "write" ? (
    <WriteStep text={draft.text} owner={owner} onChange={(text) => patch({ text })} onOwner={(o) => patch({ owner: o })} onNext={next} />
  ) : name === "people" ? (
    <PeopleStep draft={draft} owner={owner} patch={patch} onBack={back} onNext={next} />
  ) : name === "when" ? (
    <WhenStep
      mode={dated ? "date" : "quiet"}
      onMode={(m) => patch({ whenMode: m })}
      when={draft.when}
      releaseDay={draft.releaseDay}
      onDay={(d) => patch({ releaseDay: d })}
      dateDemo={draft.dateDemo}
      onDateDemo={(v) => patch({ dateDemo: v })}
      names={peopleNames}
      demo={demo}
      onChange={(when) => patch({ when })}
      onBack={back}
      onNext={next}
    />
  ) : name === "guardian" ? (
    <GuardianStep guardian={draft.guardian} onChange={(guardian) => patch({ guardian })} onBack={back} onNext={next} />
  ) : (
    <SealStep draft={{ ...draft, when: whenById(draft.when).id }} stepIndex={count - 1} onBack={back} onSealed={onSealed} />
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
                  <Numeral step={step} count={count} onTap={() => setTaps((t) => t + 1)} />
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
          <Notices />
          <m.div className="veil" aria-hidden="true" initial={false} animate={{ opacity: veil ? 1 : 0 }} transition={veilTransition} style={{ pointerEvents: veil ? "auto" : "none" }} />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
