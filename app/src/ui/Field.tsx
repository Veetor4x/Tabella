import type { ReactNode } from "react";

/** A quiet glass field: a thin line, a soft focus ring. */
export function Field({ children }: { children: ReactNode }) {
  return <div className="field">{children}</div>;
}
