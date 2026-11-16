import { useEffect, useRef } from "react";

// Pre-blurred images (made by scripts/make-background-assets.cjs): the app never runs a live blur filter.
const img = import.meta.glob<string>("../assets/bg/*.png", { eager: true, query: "?url", import: "default" });
const src = (name: string) => img[`../assets/bg/${name}.png`] ?? "";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Lines of handwriting for one depth: placed down a tall column, then repeated once so the upward drift loops without a seam. */
function column(kind: "far" | "near", seed: number, count: number, width: [number, number]) {
  const r = rng(seed);
  const lines = Array.from({ length: count }, (_, i) => ({
    name: `${kind}-${i % 4}`,
    top: (i + 0.15 + r() * 0.5) * (100 / count), // % of one half
    left: -8 + r() * 34, // vw
    width: width[0] + r() * (width[1] - width[0]), // vw
  }));
  return [0, 1].map((half) =>
    lines.map((l, i) => (
      <img key={`${half}-${i}`} src={src(l.name)} alt="" decoding="async" style={{ top: `${half * 50 + l.top / 2}%`, left: `${l.left}vw`, width: `${l.width}vw` }} />
    )),
  );
}

/** Night: a faint lattice of points. Each of the three sheets sways as a whole, so the thin links stay attached to their points. */
function lattice(seed: number, cols: number, rows: number) {
  const r = rng(seed);
  const W = 100, H = 200;
  const pts: { x: number; y: number }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push({ x: ((i + 0.2 + r() * 0.6) * W) / cols, y: ((j + 0.2 + r() * 0.6) * H) / rows });
  const links: { a: number; b: number; delay: number; dur: number }[] = [];
  pts.forEach((p, a) => {
    for (const b of [a + 1, a + cols]) {
      const q = pts[b];
      if (!q || (b === a + 1 && (a + 1) % cols === 0)) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) < 34 && r() < 0.6) links.push({ a, b, delay: -r() * 40, dur: 16 + r() * 22 });
    }
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      {links.map((l, i) => (
        <line key={i} x1={pts[l.a]!.x} y1={pts[l.a]!.y} x2={pts[l.b]!.x} y2={pts[l.b]!.y} style={{ animationDelay: `${l.delay.toFixed(1)}s`, animationDuration: `${l.dur.toFixed(1)}s` }} />
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={0.42 + (i % 3) * 0.12} />
      ))}
    </svg>
  );
}

/**
 * Flat pearl (ink at night) with a faint paper grain, and over it one very quiet moving layer:
 * day: out-of-focus handwriting drifting slowly upward at three depths; now and then a line writes itself and fades;
 * a faint wax-red glow that breathes near the bottom (it warms a little when the seal settles);
 * night: the handwriting dissolves into a lattice of points that sways, with thin lines briefly linking neighbours.
 * It shifts slightly with scroll and device tilt. Transform and opacity only; paused when the tab is hidden; still under reduced motion.
 */
export function Background() {
  const root = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const onVisible = () => el.classList.toggle("paused", document.hidden);
    document.addEventListener("visibilitychange", onVisible);
    onVisible();

    // the wax glow warms for a few seconds when the seal settles
    let warmTimer: ReturnType<typeof setTimeout> | undefined;
    const onSettle = () => {
      el.classList.add("warm");
      clearTimeout(warmTimer);
      warmTimer = setTimeout(() => el.classList.remove("warm"), 7000);
    };
    window.addEventListener("tabella:seal-settled", onSettle);

    // a slight shift with scroll and tilt (not for people who asked for less motion)
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scroll = 0, tx = 0, ty = 0, frame = 0;
    const apply = () => {
      frame = 0;
      const s = Math.max(-60, Math.min(60, scroll));
      if (far.current) far.current.style.transform = `translate3d(${(tx * 5).toFixed(1)}px, ${(-s * 0.25 + ty * 5).toFixed(1)}px, 0)`;
      if (near.current) near.current.style.transform = `translate3d(${(tx * 12).toFixed(1)}px, ${(-s * 0.6 + ty * 12).toFixed(1)}px, 0)`;
    };
    const queue = () => {
      if (!frame && !calm.matches && !document.hidden) frame = requestAnimationFrame(apply);
    };
    const onScroll = () => {
      scroll = window.scrollY * 0.12;
      queue();
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 30));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
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
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("tabella:seal-settled", onSettle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("pointermove", onPointer);
      clearTimeout(warmTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="bg" ref={root} aria-hidden="true">
      <div className="bg-shift" ref={far}>
        <div className="hand">
          <div className="drift d-far">{column("far", 11, 9, [70, 105])}</div>
          <div className="drift d-mid">{column("far", 23, 7, [95, 130])}</div>
        </div>
        <div className="lattice l-far">{lattice(5, 5, 9)}</div>
      </div>
      <div className="bg-shift" ref={near}>
        <div className="hand">
          <div className="drift d-near">{column("near", 37, 6, [115, 160])}</div>
          <div className="write w1">
            <div className="win">
              <img src={src("write-0")} alt="" />
            </div>
          </div>
          <div className="write w2">
            <div className="win">
              <img src={src("write-1")} alt="" />
            </div>
          </div>
        </div>
        <div className="lattice l-near">{lattice(9, 4, 7)}</div>
      </div>
      <div className="glow-wrap">
        <div className="glow" />
      </div>
    </div>
  );
}
