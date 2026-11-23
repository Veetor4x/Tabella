import { m } from "framer-motion";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Headline } from "./Headline";
import { fadeUp } from "./motion";
import { ProblemsContext, focusProblem, type Problem } from "./problems";
import { AsideContext, SplitBody, SplitIntro } from "./split";

interface Props {
  step: number;
  title: string;
  lead?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /**
   * What is missing or wrong on this step (empty = good to go). Continue stays tappable: pressing it with problems scrolls to the first one and
   * shows what to fix under each field; the messages go away as each field is fixed.
   */
  check?: () => Problem[];
  /** replaces the main button (the seal screen's press-and-hold) */
  action?: ReactNode;
}

/** One question per screen: a headline that rises word by word, the answer, and Back / Continue. (The number and pills live in App.) */
export function StepFrame({ step, title, lead, children, onBack, onNext, nextLabel = "Continue", nextDisabled, check, action }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const [tried, setTried] = useState(false);
  const live = tried && check ? check() : [];
  const shown = Object.fromEntries(live.map((p) => [p.id, p.message]));
  const press = () => {
    const found = check?.() ?? [];
    if (found.length) {
      setTried(true);
      focusProblem(found[0]!.id);
      return;
    }
    onNext();
  };
  const aside = useContext(AsideContext); // desktop only: the progress, drawn above the headline in the left column

  // Move focus to the new headline so screen-reader users hear where they are. Not on the very first screen,
  // so a phone keyboard does not pop up before anyone has touched anything.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (step === 0) return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="step split">
      <SplitIntro>
        {aside}
        <Headline ref={heading} text={title} />
        {lead && (
          <m.p className="lead" {...fadeUp(0.45)}>
            {lead}
          </m.p>
        )}
      </SplitIntro>
      <SplitBody>
        <m.div className="body" {...fadeUp(0.6)}>
          <ProblemsContext.Provider value={shown}>{children}</ProblemsContext.Provider>
        </m.div>
        <div className="actions">
          {onBack && (
            <Button variant="quiet" arrow="back" onClick={onBack}>
              Back
            </Button>
          )}
          {action ?? (
            <Button arrow="forward" onClick={press} disabled={nextDisabled}>
              {nextLabel}
            </Button>
          )}
        </div>
      </SplitBody>
    </div>
  );
}
