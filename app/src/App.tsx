import { useEffect, useState } from "react";
import { warmUp } from "./lib/helper";
import { whenById } from "./lib/periods";
import { clearDraft, emptyDraft, loadDraft, saveDraft, saveLetter, type Draft, type SealedLetter } from "./lib/storage";
import { DoneScreen } from "./steps/DoneScreen";
import { GuardianStep } from "./steps/GuardianStep";
import { SealStep } from "./steps/SealStep";
import { WhenStep } from "./steps/WhenStep";
import { WhoStep } from "./steps/WhoStep";
import { WriteStep } from "./steps/WriteStep";
import { joinNames } from "./ui/steps";
import { WaxSeal } from "./ui/WaxSeal";

export function App() {
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? emptyDraft());
  const [step, setStep] = useState(0);
  const [sealed, setSealed] = useState<SealedLetter | null>(null);

  // Wake the Postman now: by the time the letter is written it is up.
  useEffect(() => {
    warmUp().catch(() => {});
  }, []);
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  function onSealed(letter: SealedLetter) {
    saveLetter(letter);
    clearDraft();
    setSealed(letter);
  }

  function another() {
    setSealed(null);
    setDraft(emptyDraft());
    setStep(0);
  }

  return (
    <div className="app">
      <header className="brand">
        <span className="brand-name">
          <WaxSeal /> Tabella
        </span>
        <span className="brand-tag">Sealed today. Opened when it matters.</span>
      </header>
      <main>
        {sealed ? (
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
        )}
      </main>
      <footer>A demo on a test network. Please don't write real secrets yet.</footer>
    </div>
  );
}
