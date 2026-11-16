import { m } from "framer-motion";
import { WARNING_DAYS, WHEN_OPTIONS, type WhenId } from "../lib/periods";
import { ChoiceCard } from "../ui/ChoiceCard";
import { IconClock } from "../ui/icons";
import { screenTransition } from "../ui/motion";
import { StepFrame } from "../ui/StepFrame";

/** Where each choice sits on the thin timeline (0 to 1): a longer quiet, further along. */
const AT: Record<WhenId, number> = { demo: 0.04, "3m": 0.25, "6m": 0.5, "12m": 1 };

export function WhenStep(props: { when: WhenId; names: string; demo: boolean; onChange: (w: WhenId) => void; onBack: () => void; onNext: () => void }) {
  const options = WHEN_OPTIONS.filter((o) => !o.hidden || props.demo || props.when === "demo");
  const p = AT[props.when];
  return (
    <StepFrame step={3} title="If you go quiet, when should it *open*?" lead="If you go quiet for this long, your letter opens." onBack={props.onBack} onNext={props.onNext}>
      <div className="timeline" aria-hidden="true">
        <div className="track">
          <m.div className="track-fill" initial={false} animate={{ scaleX: p }} transition={screenTransition} />
          <m.div className="track-dot" initial={false} animate={{ x: `${p * 100}%` }} transition={screenTransition}>
            <span />
          </m.div>
        </div>
        <div className="ticks">
          <span>today</span>
          <span>3 mo</span>
          <span>6 mo</span>
          <span>12 mo</span>
        </div>
      </div>
      <div className="choices" role="radiogroup" aria-label="How long before it opens">
        {options.map((o) => (
          <ChoiceCard
            key={o.id}
            name="when"
            checked={props.when === o.id}
            onChange={() => props.onChange(o.id)}
            icon={<IconClock />}
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
