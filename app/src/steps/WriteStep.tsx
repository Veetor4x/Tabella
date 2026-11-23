import { useLayoutEffect, useRef, type RefObject } from "react";
import { MAX_LETTER_BYTES } from "../lib/seal";
import { Field } from "../ui/Field";
import { Req, useProblem } from "../ui/problems";
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

  const check = () => (!text.trim() ? [{ id: "letter", message: "Write a few lines first. Your letter can't be empty." }] : over ? [{ id: "letter", message: "That's a little too long. Please shorten it." }] : []);
  return (
    <StepFrame step={0} title="What do you want them to *read* one day?" lead="A few honest lines is enough. Say what you'd want them to know." onNext={props.onNext} check={check}>
      <LetterBox area={area} text={text} over={over} left={left} onChange={props.onChange} />
      <label htmlFor="owner-name">Your first name (optional)</label>
      <Field>
        <input id="owner-name" type="text" value={props.owner} placeholder="Alex" autoComplete="given-name" onChange={(e) => props.onOwner(e.target.value)} />
      </Field>
      <p className="tip">Write where things are, not passwords or recovery phrases.</p>
    </StepFrame>
  );
}

/** The letter box (required: marked with a red star). Turns red and says what to fix when Continue is pressed without it. */
function LetterBox(props: { area: RefObject<HTMLTextAreaElement>; text: string; over: boolean; left: number; onChange: (t: string) => void }) {
  const problem = useProblem("letter");
  return (
    <>
      <label htmlFor="letter" className="sr-only">
        Your letter
        <Req />
      </label>
      <div className={`letter-wrap glass${problem ? " invalid" : ""}`}>
        <span className="req corner" aria-hidden="true">
          *
        </span>
        <textarea
          ref={props.area}
          id="letter"
          value={props.text}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="Dear Mia and Leo…"
          aria-describedby={problem ? "letter-problem" : "letter-help"}
          aria-invalid={problem ? true : undefined}
          autoComplete="off"
          spellCheck
          rows={8}
        />
      </div>
      {problem && (
        <p className="field-problem" id="letter-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="counter" id="letter-help">
        <span className={props.over ? "over" : undefined} role={props.over ? "alert" : undefined}>
          {props.over ? "That's a little too long. Please shorten it." : `About ${props.left.toLocaleString()} characters left`}
        </span>
      </div>
    </>
  );
}
