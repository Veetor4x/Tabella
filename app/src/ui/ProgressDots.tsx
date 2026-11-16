import { m, useAnimationControls } from "framer-motion";
import { useEffect, useRef } from "react";
import { pillMove, pillTransition } from "./motion";
import { STEPS } from "./steps";

/**
 * One dot per step. A single wax-red pill sits over them: when the step changes it glides to the new dot and
 * stretches on the way (transform only). Announced to screen readers as "Step 2 of 5: Who should open it?".
 */
export function ProgressDots({ step }: { step: number }) {
  const controls = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // the pill starts in the right place (see `initial`)
    }
    void controls.start({ ...pillMove(step), transition: pillTransition });
  }, [step, controls]);

  return (
    <>
      <div className="dots-wrap">
        <ol className="dots" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]!.title}`}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={i < step ? "done" : undefined} aria-current={i === step ? "step" : undefined}>
              <span className="bar" />
              <span className="sr-only">
                {s.title}
                {i < step ? " (done)" : ""}
              </span>
            </li>
          ))}
        </ol>
        <m.div className="pill" aria-hidden="true" initial={{ x: `${step * 100}%` }} animate={controls}>
          <span className="bar" />
        </m.div>
      </div>
      <p className="step-count" aria-hidden="true">
        Step {step + 1} of {STEPS.length}
      </p>
    </>
  );
}
