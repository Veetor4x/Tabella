import { useState } from "react";
import { WARNING_DAYS, WHEN_OPTIONS, type WhenId } from "../lib/periods";
import { StepFrame } from "../ui/StepFrame";

/** The 2-minute demo timer is hidden: add ?demo to the address, or tap the hourglass five times. */
const demoFromUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

export function WhenStep(props: { when: WhenId; names: string; onChange: (w: WhenId) => void; onBack: () => void; onNext: () => void }) {
  const [taps, setTaps] = useState(0);
  const demo = demoFromUrl() || taps >= 5 || props.when === "demo";
  const options = WHEN_OPTIONS.filter((o) => !o.hidden || demo);
  return (
    <StepFrame step={3} lead="If you go quiet for this long, your letter opens." onBack={props.onBack} onNext={props.onNext} onEmojiTap={() => setTaps((t) => t + 1)}>
      <div className="choices" role="radiogroup" aria-label="How long before it opens">
        {options.map((o) => (
          <label className="choice" key={o.id}>
            <input type="radio" name="when" checked={props.when === o.id} onChange={() => props.onChange(o.id)} />
            <span className="box">
              <span className="mark" aria-hidden="true" />
              <span>
                <strong>{o.label}</strong>
                <span className="sub">
                  {o.hidden ? "For demos only. Opens after 2 quiet minutes and a 1-minute countdown." : `of quiet, then a ${WARNING_DAYS}-day countdown`}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="hint">
        Checking in takes one tap and starts the time over. Before anything opens there is always a countdown, and your guardian can pause it.
        {props.names ? ` Only ${props.names} will be able to open it.` : ""}
      </p>
    </StepFrame>
  );
}
