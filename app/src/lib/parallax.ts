/**
 * The clouds sit at three depths and shift a little with the scroll, the pointer and the phone's tilt: the near ones move
 * most. Only a transform is written, a few times a second at most while something is moving, and nothing runs at all
 * for people who ask their device for less motion, or while the tab is hidden.
 */
const DEPTH = [0.35, 0.75, 1.5]; // far, middle, near
const POINTER_PX = 16; // how far the nearest layer moves with the pointer
const SCROLL_PX = 90; // and with a whole page of scrolling

export function startParallax(root: HTMLElement): () => void {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const layers = Array.from(root.querySelectorAll<HTMLElement>(".cl"));
  let px = 0, py = 0; // pointer or tilt, -1..1
  let tx = 0, ty = 0; // where they are heading
  let cx = 0, cy = 0, cs = 0; // where they are
  let ts = 0;
  let raf = 0;
  let tilting = false;

  const scrollNow = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    ts = Math.min(1, Math.max(0, window.scrollY / max));
    kick();
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch" || tilting) return;
    px = (e.clientX / window.innerWidth - 0.5) * 2;
    py = (e.clientY / window.innerHeight - 0.5) * 2;
    kick();
  };
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    tilting = true;
    px = Math.max(-1, Math.min(1, e.gamma / 28));
    py = Math.max(-1, Math.min(1, (e.beta - 50) / 28));
    kick();
  };
  const frame = () => {
    raf = 0;
    if (document.hidden) return;
    tx = px;
    ty = py;
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    cs += (ts - cs) * 0.08;
    layers.forEach((el, i) => {
      const d = DEPTH[i] ?? 1;
      el.style.transform = `translate3d(${(-cx * POINTER_PX * d).toFixed(2)}px, ${(-cy * POINTER_PX * 0.6 * d - cs * SCROLL_PX * d).toFixed(2)}px, 0)`;
    });
    if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002 || Math.abs(ts - cs) > 0.0005) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  };

  window.addEventListener("scroll", scrollNow, { passive: true });
  window.addEventListener("resize", scrollNow, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("deviceorientation", onTilt, { passive: true });
  document.addEventListener("visibilitychange", kick);
  scrollNow();
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", scrollNow);
    window.removeEventListener("resize", scrollNow);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("deviceorientation", onTilt);
    document.removeEventListener("visibilitychange", kick);
  };
}
