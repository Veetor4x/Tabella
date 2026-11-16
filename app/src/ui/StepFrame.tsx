import { m } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { emojiPop, rise, riseContainer } from "./motion";
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

/** One step per screen: a calm heading, the content, and big Back / Next buttons. (The dots live above, in App.) */
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
    <m.div variants={riseContainer} initial="hidden" animate="show">
      <m.h1 ref={heading} tabIndex={-1} variants={rise}>
        <m.span className="emoji" aria-hidden="true" onClick={onEmojiTap} {...emojiPop}>
          {s.emoji}
        </m.span>
        {s.title}
      </m.h1>
      {lead && (
        <m.p className="lead" variants={rise}>
          {lead}
        </m.p>
      )}
      <m.div variants={rise}>{children}</m.div>
      <m.div className="actions" variants={rise}>
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        )}
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      </m.div>
    </m.div>
  );
}
