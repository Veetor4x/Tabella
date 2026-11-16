import type { ReactNode } from "react";

/** Wraps an input so it can glow softly on focus (the glow fades in with opacity; nothing else animates). */
export function Field({ children }: { children: ReactNode }) {
  return (
    <span className="field">
      {children}
      <span className="glow" aria-hidden="true" />
    </span>
  );
}
