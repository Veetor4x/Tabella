import { useState } from "react";
import { WARNING_DAYS, WHEN_OPTIONS, type WhenId } from "../lib/periods";
import { ChoiceCard } from "../ui/ChoiceCard";
import { Hourglass } from "../ui/Hourglass";
import { StepFrame } from "../ui/StepFrame";

/** The 2-minute demo timer is hidden: add ?demo to the address, or tap the hourglass five times. */
const demoFromUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

/** How full the hourglass is for each choice: a longer wait, more sand. */
const SAND: Record<WhenId, number> = { demo: 0.08, "3m": 0.34, "6m": 0.64, "12m": 1 };

export function WhenStep(props: { when: WhenId; names: string; onChange: (w: WhenId) => void; onBack: () => void; onNext: () => void }) {
  const [taps, setTaps] = useState(0);
  const demo = demoFromUrl() || taps >= 5 || props.when === "demo";
  const options = WHEN_OPTIONS.filter((o) => !o.hidden || demo);
  return (
    <StepFrame step={3} lead="If you go quiet for this long, your letter opens." onBack={props.onBack} onNext={props.onNext} onEmojiTap={() => setTaps((t) => t + 1)}>
      <Hourglass level={SAND[props.when]} />
      <div className="choices" role="radiogroup" aria-label="How long before it opens">
        {options.map((o) => (
          <ChoiceCard
            key={o.id}
            name="when"
            checked={props.when === o.id}
            onChange={() => props.onChange(o.id)}
            title={o.label}
            sub={o.hidden ? "For demos only. Opens after 2 quiet minutes and a 1-minute countdown." : `of quiet, then a ${WARNING_DAYS}-day countdown`}
          />
        ))}
      </div>
      <p className="hint">
        Checking in takes one tap and starts the time over. Before anything opens there is always a countdown, and your guardian can pause it.
        {props.names ? ` Only ${props.names} will be able to open it.` : ""}
      </p>
    </StepFrame>
  );
}
