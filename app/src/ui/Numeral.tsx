import { m } from "framer-motion";
import { STEP_COUNT } from "./steps";
import { numeralRoll, progressTo, screenTransition } from "./motion";

/** The big step number (01 to 05) in editorial type, with a hairline that fills as you go. Five taps on it open the demo timer. */
export function Numeral({ step, onTap }: { step: number; onTap?: () => void }) {
  return (
    <div className="numeral-wrap">
      <div className="numeral" onClick={onTap} role="img" aria-label={`Step ${step + 1} of ${STEP_COUNT}`}>
        <m.div className="numeral-col" initial={false} animate={numeralRoll(step)} transition={screenTransition} aria-hidden="true">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i}>{String(i + 1).padStart(2, "0")}</span>
          ))}
        </m.div>
      </div>
      <div className="numeral-meta" aria-hidden="true">
        <span>of 0{STEP_COUNT}</span>
        <div className="hair">
          <m.div className="hair-fill" initial={false} animate={progressTo(step, STEP_COUNT)} transition={screenTransition} />
        </div>
      </div>
    </div>
  );
}
