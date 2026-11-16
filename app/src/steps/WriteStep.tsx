import { useLayoutEffect, useRef } from "react";
import { MAX_LETTER_BYTES } from "../lib/seal";
import { Field } from "../ui/Field";
import { StepFrame } from "../ui/StepFrame";

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function WriteStep(props: { text: string; owner: string; onChange: (t: string) => void; onOwner: (n: string) => void; onNext: () => void }) {
  const { text } = props;
  const used = bytes(text);
  const over = used > MAX_LETTER_BYTES;
  // roughly one byte per character in English; other scripts take more, so we say "about"
  const left = Math.max(0, MAX_LETTER_BYTES - used);

  // The letter box grows as you type.
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <StepFrame step={0} title="What do you want them to *read* one day?" lead="A few honest lines is enough. Say what you'd want them to know." onNext={props.onNext} nextDisabled={!text.trim() || over}>
      <label htmlFor="letter" className="sr-only">
        Your letter
      </label>
      <div className="letter-wrap glass">
        <textarea
          ref={area}
          id="letter"
          value={text}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="Dear Mia and Leo…"
          aria-describedby="letter-help"
          autoComplete="off"
          spellCheck
          rows={8}
        />
      </div>
      <div className="counter" id="letter-help">
        <span className={over ? "over" : undefined} role={over ? "alert" : undefined}>
          {over ? "That's a little too long. Please shorten it." : `About ${left.toLocaleString()} characters left`}
        </span>
      </div>
      <label htmlFor="owner-name">Your first name (optional)</label>
      <Field>
        <input id="owner-name" type="text" value={props.owner} placeholder="Alex" autoComplete="given-name" onChange={(e) => props.onOwner(e.target.value)} />
      </Field>
      <p className="tip">Write where things are, not passwords or recovery phrases.</p>
    </StepFrame>
  );
}
