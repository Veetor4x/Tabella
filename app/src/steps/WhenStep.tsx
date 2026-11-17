import { m } from "framer-motion";
import { WARNING_DAYS, WHEN_OPTIONS, fromNow, longDay, maxDay, minDay, releaseAtFor, type WhenId, type WhenMode } from "../lib/periods";
import { ChoiceCard } from "../ui/ChoiceCard";
import { Field } from "../ui/Field";
import { IconClock, IconLetter } from "../ui/icons";
import { screenTransition } from "../ui/motion";
import { StepFrame } from "../ui/StepFrame";

/** Where each choice sits on the thin timeline (0 to 1): a longer quiet, further along. */
const AT: Record<WhenId, number> = { demo: 0.04, "3m": 0.25, "6m": 0.5, "12m": 1 };

/** Can this step go on? A dated letter needs a real day in range (or the 2-minute demo). */
export const whenReady = (mode: WhenMode, day: string | undefined, dateDemo: boolean | undefined) => mode === "quiet" || !!dateDemo || (!!day && releaseAtFor(day) !== null);

export function WhenStep(props: {
  mode: WhenMode;
  onMode: (m: WhenMode) => void;
  when: WhenId;
  releaseDay?: string;
  onDay: (d: string) => void;
  dateDemo?: boolean;
  onDateDemo: (v: boolean) => void;
  names: string;
  demo: boolean;
  onChange: (w: WhenId) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const options = WHEN_OPTIONS.filter((o) => !o.hidden || props.demo || props.when === "demo");
  const p = AT[props.when];
  const dated = props.mode === "date";
  const at = props.releaseDay ? releaseAtFor(props.releaseDay) : null;
  const showDemoDate = props.demo || !!props.dateDemo;
  return (
    <StepFrame step={2} title="When should it *open*?" lead="Choose how it decides." onBack={props.onBack} onNext={props.onNext} nextDisabled={!whenReady(props.mode, props.releaseDay, props.dateDemo)}>
      <div className="choices" role="radiogroup" aria-label="How it decides when to open">
        <ChoiceCard name="when-mode" checked={!dated} onChange={() => props.onMode("quiet")} icon={<IconClock />} title="If I go quiet" sub="It opens only if you stop checking in for a long time. A guardian can pause it." />
        <ChoiceCard name="when-mode" checked={dated} onChange={() => props.onMode("date")} icon={<IconLetter />} title="On a date" sub="It opens on the day you pick, like a time capsule for a birthday or a wedding. No check-ins." />
      </div>

      {!dated && (
        <>
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
        </>
      )}

      {dated && (
        <>
          <label htmlFor="release-day">The day it opens</label>
          <Field>
            <input id="release-day" type="date" className="date-input" value={props.dateDemo ? "" : props.releaseDay ?? ""} min={minDay()} max={maxDay()} disabled={!!props.dateDemo} onChange={(e) => (props.onDateDemo(false), props.onDay(e.target.value))} />
          </Field>
          <p className="date-echo" role="status" aria-live="polite">
            {props.dateDemo ? "It will open 2 minutes after you seal it." : at ? `Opens at the start of ${longDay(at)}, ${fromNow(at)}.` : props.releaseDay ? "Pick a day from tomorrow, up to 50 years ahead." : "Pick a day from tomorrow, up to 50 years ahead."}
          </p>
          {showDemoDate && (
            <div className="choices" role="radiogroup" aria-label="Demo date">
              <ChoiceCard name="date-demo" checked={!!props.dateDemo} onChange={() => props.onDateDemo(!props.dateDemo)} icon={<IconClock />} title="In 2 minutes (demo)" sub="For demos only. It opens 2 minutes after you seal it." />
            </div>
          )}
          <p className="hint">
            It opens on that day whether or not you check in, so there is nothing to keep up and no guardian is needed. You can still cancel it any time before then.
            {props.names ? ` Only ${props.names} will be able to open it.` : ""}
          </p>
        </>
      )}
    </StepFrame>
  );
}
