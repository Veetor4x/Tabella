import { useEffect, useRef, type ReactNode } from "react";
import { ProgressDots } from "./ProgressDots";
import { STEPS } from "./steps";

interface Props {
  step: number;
  lead?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Secret gesture hook for the hourglass (opens the demo timer). */
  onEmojiTap?: () => void;
}

/** One step per screen: progress dots, a calm heading, the content, and big Back / Next buttons. */
export function StepFrame({ step, lead, children, onBack, onNext, nextLabel = "Next", nextDisabled, onEmojiTap }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Move focus to the new heading so screen-reader users hear where they are. Not on the very first screen,
  // so a phone keyboard does not pop up before anyone has touched anything.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (step === 0) return;
    }
    heading.current?.focus();
  }, [step]);

  const s = STEPS[step]!;
  return (
    <>
      <ProgressDots step={step} />
      <p className="step-count" aria-hidden="true">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 ref={heading} tabIndex={-1}>
        <span className="emoji" aria-hidden="true" onClick={onEmojiTap}>
          {s.emoji}
        </span>
        {s.title}
      </h1>
      {lead && <p className="lead">{lead}</p>}
      {children}
      <div className="actions">
        {onBack && (
          <button type="button" className="btn secondary" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" className="btn primary" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </button>
      </div>
    </>
  );
}
