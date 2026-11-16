import type { ReactNode } from "react";

/** A big, calm choice. The whole card is the radio button, so a thumb anywhere on it picks it. */
export function ChoiceCard(props: { name: string; checked: boolean; onChange: () => void; title: string; sub: string; icon?: ReactNode }) {
  return (
    <label className={`choice glass ${props.checked ? "on" : ""}`}>
      <input type="radio" name={props.name} checked={props.checked} onChange={props.onChange} />
      {props.icon && <span className="choice-icon">{props.icon}</span>}
      <span className="choice-text">
        <strong>{props.title}</strong>
        <span>{props.sub}</span>
      </span>
      <span className="choice-ring" aria-hidden="true" />
    </label>
  );
}
