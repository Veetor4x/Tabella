import { useEffect, useRef, type ReactNode } from "react";
import { useProblem } from "./problems";

/**
 * A quiet glass field: a thin line, a soft focus ring. Give it the input's `id` and, when Continue was pressed with this field missing or
 * wrong, it turns red and says what to fix, right under it.
 */
export function Field({ children, id }: { children: ReactNode; id?: string }) {
  const problem = useProblem(id);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector("input, textarea, select");
    if (!el) return;
    if (problem) {
      if (!el.hasAttribute("data-prev-desc")) el.setAttribute("data-prev-desc", el.getAttribute("aria-describedby") ?? "");
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", `${id}-problem`);
    } else if (el.hasAttribute("data-prev-desc")) {
      el.removeAttribute("aria-invalid");
      const prev = el.getAttribute("data-prev-desc");
      if (prev) el.setAttribute("aria-describedby", prev);
      else el.removeAttribute("aria-describedby");
      el.removeAttribute("data-prev-desc");
    }
  }, [problem, id]);
  return (
    <>
      <div ref={box} className={`field${problem ? " invalid" : ""}`}>
        {children}
      </div>
      {problem && (
        <p className="field-problem" id={`${id}-problem`} role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
