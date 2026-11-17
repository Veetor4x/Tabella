import { Wipe } from "./Wipe";

/** The name the letter is signed with: the last line when it ends "…, Alex." or just "Alex". */
export function signerOf(text: string): string | null {
  const last = text.trim().split("\n").filter((l) => l.trim()).pop() ?? "";
  const m = /(?:^|[,—-]\s*)([A-ZÀ-Ý][\p{L}'’-]{1,18})[.!]?$/u.exec(last.trim());
  return m ? m[1]! : null;
}

/** A handwritten signature that writes itself at the end of an opened letter: a slanted name and a swash underneath. */
export function Signature({ name, delay = 0.3, play = true }: { name: string | null; delay?: number; play?: boolean }) {
  return (
    <div className="sig" role="img" aria-label={name ? `Signed, ${name}` : "Signed"}>
      <Wipe duration={2.4} delay={delay} play={play}>
        <svg viewBox="0 0 240 84" width="200" height="70" aria-hidden="true">
          {name && (
            <text className="sig-name" x="10" y="50" transform="rotate(-4 10 50)">
              {name}
            </text>
          )}
          <path className="sig-swash" d={name ? "M8 64 C48 72 96 52 150 58 S214 62 232 50" : "M10 50 C40 20 70 70 100 40 S150 30 170 48 S210 56 228 36"} />
        </svg>
      </Wipe>
    </div>
  );
}
