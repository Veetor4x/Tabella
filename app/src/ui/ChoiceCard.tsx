import { m } from "framer-motion";
import type { ReactNode } from "react";
import { cardHover, cardTap } from "./motion";

/** A big selectable glass card (a radio button underneath). It lifts and tilts under a finger or the pointer. */
export function ChoiceCard(props: { name: string; checked: boolean; onChange: () => void; title: string; sub: ReactNode }) {
  return (
    <m.label className="choice" whileHover={cardHover} whileTap={cardTap}>
      <input type="radio" name={props.name} checked={props.checked} onChange={props.onChange} />
      <span className="box glass">
        <span className="mark" aria-hidden="true" />
        <span>
          <strong>{props.title}</strong>
          <span className="sub">{props.sub}</span>
        </span>
      </span>
    </m.label>
  );
}
