import { createContext, useContext, type ReactNode } from "react";

/** One thing to fix: the id of the field, and a plain sentence saying what to do. */
export interface Problem {
  id: string;
  message: string;
}

/** The problems currently shown, by field id. Empty until Continue has been pressed with something missing or wrong. */
export const ProblemsContext = createContext<Record<string, string>>({});

export const useProblem = (id: string | undefined): string | undefined => {
  const all = useContext(ProblemsContext);
  return id ? all[id] : undefined;
};

/** Shows problems for a part of the page that is not inside a step (for example the restore box). */
export function ProblemsProvider({ problems, children }: { problems: Problem[]; children: ReactNode }) {
  return <ProblemsContext.Provider value={Object.fromEntries(problems.map((p) => [p.id, p.message]))}>{children}</ProblemsContext.Provider>;
}

/** The red star that marks a required field. Screen readers hear "required" instead. */
export function Req() {
  return (
    <>
      <span className="req" aria-hidden="true">
        {" "}
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** Scroll to the first problem, and put the cursor in it. */
export function focusProblem(id: string | undefined) {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    const el = (id && document.getElementById(id)) || document.querySelector<HTMLElement>(".field.invalid input, .field.invalid textarea, .field.invalid select, .invalid textarea");
    if (!el) return;
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  });
}
