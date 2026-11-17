/**
 * Instead of a spinner: a pen draws a calm line, over and over. The line is written by a window sliding across it
 * (movement only), with a small pen riding the leading edge. Under reduced motion the line simply rests and softly fades.
 */
export function PenLine({ label }: { label?: string }) {
  return (
    <span className="penline" role="img" aria-label={label ?? "Working"}>
      <span className="pen-win">
        <span className="pen-in">
          <svg viewBox="0 0 140 28" width="140" height="28" aria-hidden="true">
            <path d="M4 18 C22 6 34 26 52 14 S86 6 104 16 S128 20 136 12" />
          </svg>
        </span>
      </span>
      <span className="pen-nib">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 14 L4 9 L11 2 L14 5 L7 12 Z M4 9 L7 12" />
        </svg>
      </span>
    </span>
  );
}
