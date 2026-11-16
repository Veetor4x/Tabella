import { useEffect, useRef } from "react";

// Pre-rendered, already-soft smoke sprites (scripts/make-smoke-sprites.cjs): the app never runs a live blur filter.
const img = import.meta.glob<string>("../assets/smoke/*.png", { eager: true, query: "?url", import: "default" });
const sprite = (name: string) => img[`../assets/smoke/${name}.png`] ?? "";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const MAX_WISPS = 5;
const MOTES = 14;

/**
 * Flat pearl (deep ink at night) with a faint paper grain, and over it one soft layer:
 * a few slow wisps of smoke curling up from the bottom, like a candle just blown out, and a handful of dust motes.
 * Every wisp and mote gets its own random path and timing, so nothing repeats visibly.
 * Moved with transform and opacity only; shifts slightly with scroll and tilt (two depths); a small puff rises
 * from behind the seal when it settles; paused when the tab is hidden; still under reduced motion.
 */
export function Background() {
  const root = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current, farEl = far.current, nearEl = near.current;
    if (!el || !farEl || !nearEl || typeof el.animate !== "function") return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const live = new Set<Animation>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let wisps = 0, stopped = false;

    const later = (f: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!stopped && !document.hidden) f();
      }, ms);
      timers.add(t);
    };
    const track = (a: Animation, done?: () => void) => {
      live.add(a);
      a.onfinish = () => {
        live.delete(a);
        done?.();
      };
      return a;
    };

    function makeWisp(layer: HTMLElement, x: number, bottomPx: number, widthPx: number) {
      const w = document.createElement("div");
      w.className = "wisp";
      w.style.left = `${x - widthPx / 2}px`;
      w.style.bottom = `${bottomPx}px`;
      w.style.width = `${widthPx}px`;
      const k = Math.floor(Math.random() * 4);
      w.innerHTML = `<div class="wisp-in"><img class="d" alt="" src="${sprite(`d-${k}`)}"><img class="n" alt="" src="${sprite(`n-${k}`)}"></div>`;
      if (Math.random() < 0.5) (w.firstChild as HTMLElement).style.scale = "-1 1"; // mirror some, for variety
      layer.appendChild(w);
      return w;
    }

    /** One wisp: rises, widens, leans and turns a little, and fades. opts.puff = the short one behind the seal. */
    function wisp(opts?: { x: number; y: number; puff: true }, startAt = 0) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const puff = !!opts;
      const layer = Math.random() < 0.5 ? farEl! : nearEl!;
      const width = puff ? rand(90, 130) : rand(0.34, 0.6) * Math.min(vw, 520);
      const x = opts ? opts.x + rand(-14, 14) : rand(0.12, 0.88) * vw;
      const bottom = opts ? vh - opts.y - rand(0, 20) : -rand(0.1, 0.3) * width * 2;
      const w = makeWisp(layer, x, bottom, width);
      const peak = puff ? rand(0.08, 0.1) : rand(0.06, 0.1);
      const rise = puff ? rand(0.16, 0.26) * vh : rand(0.5, 0.85) * vh;
      const dx = rand(-0.14, 0.14) * vw, r0 = rand(-7, 7), r1 = r0 + rand(-16, 16);
      const duration = puff ? rand(5200, 7000) : rand(19000, 30000);
      if (!puff) wisps++;
      const a = track(
        w.animate(
          [
            { transform: `translate3d(0, 0, 0) scale(${puff ? 0.5 : 0.6}) rotate(${r0}deg)`, opacity: 0 },
            { opacity: peak, offset: puff ? 0.22 : 0.2 },
            { opacity: peak * 0.75, offset: 0.6 },
            { transform: `translate3d(${dx}px, ${-rise}px, 0) scale(${puff ? 1.25 : rand(1.3, 1.7)}) rotate(${r1}deg)`, opacity: 0 },
          ],
          { duration, easing: "cubic-bezier(0.25, 0.6, 0.35, 1)", fill: "forwards" },
        ),
        () => {
          w.remove();
          if (!puff) wisps--;
        },
      );
      // the curl: the sprite inside leans one way, then the other, at its own pace
      const s = rand(4, 10) * (Math.random() < 0.5 ? -1 : 1);
      track(
        w.firstElementChild!.animate(
          [{ transform: `skewX(${-s}deg) scaleX(0.92)` }, { transform: `skewX(${s}deg) scaleX(1.12)`, offset: rand(0.4, 0.6) }, { transform: `skewX(${-s * 0.5}deg) scaleX(1)` }],
          { duration, easing: "ease-in-out", fill: "forwards" },
        ),
      );
      if (startAt) a.currentTime = duration * startAt;
    }

    /** A dust mote: a tiny soft dot that drifts along its own short path, brightens as it "catches the light", and goes. */
    function mote(first = false) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const deep = Math.random() < 0.5;
      const m = document.createElement("div");
      m.className = "mote";
      const size = deep ? rand(2, 3.5) : rand(3.5, 6);
      m.style.width = m.style.height = `${size}px`;
      m.style.left = `${rand(0.04, 0.96) * vw}px`;
      m.style.top = `${rand(0.08, 0.92) * vh}px`;
      (deep ? farEl! : nearEl!).appendChild(m);
      const peak = deep ? rand(0.18, 0.3) : rand(0.3, 0.5);
      const p = () => `translate3d(${rand(-40, 40)}px, ${rand(-70, 10)}px, 0)`;
      const duration = rand(16000, 34000);
      const a = track(
        m.animate(
          [
            { transform: "translate3d(0, 0, 0)", opacity: 0 },
            { transform: p(), opacity: peak, offset: rand(0.25, 0.4) },
            { transform: p(), opacity: peak * 0.35, offset: rand(0.55, 0.7) },
            { transform: p(), opacity: 0 },
          ],
          { duration, easing: "ease-in-out", fill: "forwards" },
        ),
        () => {
          m.remove();
          later(() => mote(), rand(200, 2500));
        },
      );
      if (first) a.currentTime = duration * rand(0, 0.8);
    }

    if (calm) {
      // still: three faint wisps and a few motes, placed once, nothing moves
      const vw = window.innerWidth;
      [0.22, 0.56, 0.84].forEach((fx, i) => {
        const w = makeWisp(i === 1 ? nearEl : farEl, fx * vw, rand(0, 120), rand(0.4, 0.55) * Math.min(vw, 520));
        w.style.opacity = "0.07";
      });
      for (let i = 0; i < 8; i++) {
        const m = document.createElement("div");
        m.className = "mote";
        m.style.cssText = `width:4px;height:4px;left:${rand(5, 95)}%;top:${rand(8, 92)}%;opacity:0.3`;
        farEl.appendChild(m);
      }
      return () => {
        farEl.replaceChildren();
        nearEl.replaceChildren();
      };
    }

    let run = 0; // only the newest loop keeps going (a new one starts when the tab comes back)
    const loop = (id = ++run) => {
      if (id !== run) return;
      if (wisps < MAX_WISPS) wisp();
      later(() => loop(id), rand(3500, 7500));
    };
    wisp(undefined, rand(0.15, 0.3));
    wisp(undefined, rand(0.35, 0.5));
    later(() => loop(), 1500);
    for (let i = 0; i < MOTES; i++) mote(true);

    // a gentle puff from behind the seal when it settles
    const onSettle = () => {
      const seal = document.querySelector(".seal-wrap")?.getBoundingClientRect();
      if (!seal) return;
      const at = { x: seal.left + seal.width / 2, y: seal.top + seal.height * 0.35, puff: true as const };
      wisp(at);
      later(() => wisp(at), 350);
      later(() => wisp(at), 900);
    };
    window.addEventListener("tabella:seal-settled", onSettle);

    // paused while the tab is hidden
    const onVisible = () => {
      if (document.hidden) live.forEach((a) => a.pause());
      else {
        live.forEach((a) => a.play());
        later(() => loop(), 1200);
      }
      el.dataset.paused = String(document.hidden);
    };
    document.addEventListener("visibilitychange", onVisible);

    // depth: the two layers shift a little with scroll and tilt, the near one more
    let scroll = 0, tx = 0, ty = 0, frame = 0;
    const apply = () => {
      frame = 0;
      const s = Math.max(-80, Math.min(80, scroll));
      farEl.style.transform = `translate3d(${(tx * 6).toFixed(1)}px, ${(-s * 0.3 + ty * 6).toFixed(1)}px, 0)`;
      nearEl.style.transform = `translate3d(${(tx * 16).toFixed(1)}px, ${(-s * 0.75 + ty * 16).toFixed(1)}px, 0)`;
    };
    const queue = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(apply);
    };
    const onScroll = () => {
      scroll = window.scrollY * 0.14;
      queue();
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 28));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
      queue();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = (e.clientX / window.innerWidth - 0.5) * 1.2;
      ty = (e.clientY / window.innerHeight - 0.5) * 1.2;
      queue();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("deviceorientation", onTilt);
    window.addEventListener("pointermove", onPointer, { passive: true });
    // iPhones only share tilt after a system question, and only when asked from a tap: ask once, on the first tap.
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    const askTilt = () => {
      window.removeEventListener("pointerup", askTilt);
      DOE?.requestPermission?.().catch(() => {});
    };
    if (typeof DOE?.requestPermission === "function") window.addEventListener("pointerup", askTilt);

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      live.forEach((a) => a.cancel());
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("tabella:seal-settled", onSettle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerup", askTilt);
      farEl.replaceChildren();
      nearEl.replaceChildren();
    };
  }, []);

  return (
    <div className="bg" ref={root} aria-hidden="true">
      <div className="bg-depth" ref={far} />
      <div className="bg-depth" ref={near} />
    </div>
  );
}
