import { StepFrame } from "../ui/StepFrame";

export function GuardianStep(props: { guardian: { name: string } | null; onChange: (g: { name: string } | null) => void; onBack: () => void; onNext: () => void }) {
  const on = props.guardian !== null;
  return (
    <StepFrame step={2} lead="A guardian is someone you trust. If you go quiet, they can tap “They're okay” to give you more time." onBack={props.onBack} onNext={props.onNext} nextDisabled={on && !props.guardian!.name.trim()}>
      <div className="choices" role="radiogroup" aria-label="Guardian">
        <label className="choice">
          <input type="radio" name="guardian" checked={on} onChange={() => props.onChange(props.guardian ?? { name: "" })} />
          <span className="box">
            <span className="mark" aria-hidden="true" />
            <span>
              <strong>Add a guardian</strong>
              <span className="sub">They can pause the countdown, up to twice.</span>
            </span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="guardian" checked={!on} onChange={() => props.onChange(null)} />
          <span className="box">
            <span className="mark" aria-hidden="true" />
            <span>
              <strong>Skip for now</strong>
              <span className="sub">You can still check in yourself, any time.</span>
            </span>
          </span>
        </label>
      </div>
      {on && (
        <>
          <label htmlFor="guardian-name">Their name</label>
          <input id="guardian-name" type="text" value={props.guardian!.name} placeholder="Sofia" autoComplete="off" onChange={(e) => props.onChange({ name: e.target.value })} />
          <p className="hint">After sealing you'll get a guardian card to give them.</p>
        </>
      )}
    </StepFrame>
  );
}
