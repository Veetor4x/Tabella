import { STEPS } from "./steps";

/** One dot per step. Announced to screen readers as "Step 2 of 5: Who should open it?". */
export function ProgressDots({ step }: { step: number }) {
  return (
    <ol className="dots" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]!.title}`}>
      {STEPS.map((s, i) => (
        <li key={s.title} className={i < step ? "done" : undefined} aria-current={i === step ? "step" : undefined}>
          <span className="sr-only">
            {s.title}
            {i < step ? " (done)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
