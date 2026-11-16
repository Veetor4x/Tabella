import { StepFrame } from "../ui/StepFrame";
import { MAX_LETTER_BYTES } from "../lib/seal";

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function WriteStep({ text, onChange, onNext }: { text: string; onChange: (t: string) => void; onNext: () => void }) {
  const used = bytes(text);
  const over = used > MAX_LETTER_BYTES;
  // roughly one byte per character in English; emoji and other scripts take more, so we say "about"
  const left = Math.max(0, Math.floor((MAX_LETTER_BYTES - used) / 1));
  return (
    <StepFrame step={0} lead="Write something they'll want to read one day." onNext={onNext} nextDisabled={!text.trim() || over}>
      <label htmlFor="letter" className="sr-only">
        Your letter
      </label>
      <textarea
        id="letter"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Dear Mia and Leo…"
        aria-describedby="letter-help"
        autoComplete="off"
        spellCheck
        rows={8}
      />
      <div className="counter" id="letter-help">
        <span className={over ? "over" : undefined} role={over ? "alert" : undefined}>
          {over ? "That's a little too long. Please shorten it." : `About ${left.toLocaleString()} characters left`}
        </span>
      </div>
      <p className="tip">Write where things are, not passwords or recovery phrases.</p>
    </StepFrame>
  );
}
