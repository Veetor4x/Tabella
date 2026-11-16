import { m, useAnimationControls } from "framer-motion";
import { useLayoutEffect, useRef } from "react";
import { MAX_LETTER_BYTES } from "../lib/seal";
import { plateGrow, plateGrowTransition } from "../ui/motion";
import { StepFrame } from "../ui/StepFrame";

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function WriteStep({ text, onChange, onNext }: { text: string; onChange: (t: string) => void; onNext: () => void }) {
  const used = bytes(text);
  const over = used > MAX_LETTER_BYTES;
  // roughly one byte per character in English; emoji and other scripts take more, so we say "about"
  const left = Math.max(0, Math.floor((MAX_LETTER_BYTES - used) / 1));

  // The letter box grows as you type. The height itself changes at once (no animated layout);
  // the glass plate behind it eases to the new size with a transform.
  const area = useRef<HTMLTextAreaElement>(null);
  const lastHeight = useRef(0);
  const plate = useAnimationControls();
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = `${h}px`;
    if (lastHeight.current && h > lastHeight.current) void plate.start({ ...plateGrow, transition: plateGrowTransition });
    lastHeight.current = h;
  }, [text, plate]);

  return (
    <StepFrame step={0} lead="Write something they'll want to read one day." onNext={onNext} nextDisabled={!text.trim() || over}>
      <label htmlFor="letter" className="sr-only">
        Your letter
      </label>
      <div className="letter-wrap field">
        <m.div className="letter-plate glass" aria-hidden="true" style={{ originY: 0 }} animate={plate} />
        <textarea
          ref={area}
          id="letter"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Dear Mia and Leo…"
          aria-describedby="letter-help"
          autoComplete="off"
          spellCheck
          rows={8}
        />
        <span className="glow" aria-hidden="true" />
      </div>
      <div className="counter" id="letter-help">
        <span className={over ? "over" : undefined} role={over ? "alert" : undefined}>
          {over ? "That's a little too long. Please shorten it." : `About ${left.toLocaleString()} characters left`}
        </span>
      </div>
      <p className="tip glass">Write where things are, not passwords or recovery phrases.</p>
    </StepFrame>
  );
}
