import { ChoiceCard } from "../ui/ChoiceCard";
import { Field } from "../ui/Field";
import { IconShield, IconUser } from "../ui/icons";
import { StepFrame } from "../ui/StepFrame";

export function GuardianStep(props: { guardian: { name: string } | null; onChange: (g: { name: string } | null) => void; onBack: () => void; onNext: () => void }) {
  const on = props.guardian !== null;
  return (
    <StepFrame
      step={3}
      title="Is there someone who can say you're *okay*?"
      lead="A guardian is someone you trust. If you go quiet, they can tap “They're okay” to give you more time."
      onBack={props.onBack}
      onNext={props.onNext}
      nextDisabled={on && !props.guardian!.name.trim()}
    >
      <div className="choices" role="radiogroup" aria-label="Guardian">
        <ChoiceCard name="guardian" checked={on} onChange={() => props.onChange(props.guardian ?? { name: "" })} icon={<IconShield />} title="Add a guardian" sub="They can pause the countdown, up to twice." />
        <ChoiceCard name="guardian" checked={!on} onChange={() => props.onChange(null)} icon={<IconUser />} title="Skip for now" sub="You can still check in yourself, any time." />
      </div>
      {on && (
        <>
          <label htmlFor="guardian-name">Their name</label>
          <Field>
            <input id="guardian-name" type="text" value={props.guardian!.name} placeholder="Sofia" autoComplete="off" onChange={(e) => props.onChange({ name: e.target.value })} />
          </Field>
          <p className="hint">After sealing you'll get a guardian card to give them.</p>
        </>
      )}
    </StepFrame>
  );
}
