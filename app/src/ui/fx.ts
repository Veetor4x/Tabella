/**
 * Two small touches of polish, on for everyone:
 *   - a soft light that follows the pointer across glass cards (mouse and pen only, never on touch)
 *   - a slow shine that crosses the main wax-red button every few seconds
 * Both move only transform and opacity, and neither runs for people who ask their device for less motion.
 * Patterns in the spirit of Aceternity UI and Magic UI, written from scratch for this site.
 */
export function initFx(): void {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.fx = "1";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.dataset.fxCalm = "1"; // no shine, no moving light
    return;
  }

  let lit: HTMLElement | null = null;
  const off = (el: HTMLElement | null) => el?.style.setProperty("--go", "0");
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.(".glass") as HTMLElement | null;
      if (el !== lit) {
        off(lit);
        lit = el;
      }
      if (!el) return;
      if (el.dataset.fxRel === undefined && getComputedStyle(el).position === "static") el.dataset.fxRel = "1";
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${e.clientX - r.left}px`);
      el.style.setProperty("--gy", `${e.clientY - r.top}px`);
      el.style.setProperty("--go", "1");
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", () => off(lit), true);
}
