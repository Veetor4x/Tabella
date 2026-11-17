/**
 * A preview of extra polish, OFF by default so the site looks exactly as before.
 *   add ?fx=1 to any address to turn it on (remembered on this device); ?fx=0 turns it off again.
 * What it adds (all moves are transform and opacity only, and none of it runs with reduced motion):
 *   - a soft light that follows the pointer across glass cards
 *   - a slow shine that crosses the main (wax) button
 *   - a thin light that travels around the demo phone
 * Patterns in the spirit of Aceternity UI, Magic UI and React Bits, written from scratch for this site.
 */
const KEY = "tabella.fx";

export function fxEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function initFx(): void {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(window.location.search).get("fx");
    if (q === "1") window.localStorage.setItem(KEY, "1");
    if (q === "0") window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the preview simply stays off */
  }
  if (!fxEnabled()) return;
  document.documentElement.dataset.fx = "1";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.dataset.fxCalm = "1"; // the static parts only
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
