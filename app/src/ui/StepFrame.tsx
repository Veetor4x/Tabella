import { m } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Headline } from "./Headline";
import { fadeUp } from "./motion";

interface Props {
  step: number;
  title: string;
  lead?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** replaces the main button (the seal screen's press-and-hold) */
  action?: ReactNode;
}

/** One question per screen: a headline that rises word by word, the answer, and Back / Continue. (The number and pills live in App.) */
export function StepFrame({ step, title, lead, children, onBack, onNext, nextLabel = "Continue", nextDisabled, action }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

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
    <div className="step">
      <Headline ref={heading} text={title} />
      {lead && (
        <m.p className="lead" {...fadeUp(0.45)}>
          {lead}
        </m.p>
      )}
      <m.div className="body" {...fadeUp(0.6)}>
        {children}
      </m.div>
      <div className="actions">
        {onBack && (
          <Button variant="quiet" arrow="back" onClick={onBack}>
            Back
          </Button>
        )}
        {action ?? (
          <Button arrow="forward" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
