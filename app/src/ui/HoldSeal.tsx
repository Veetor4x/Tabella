import { m, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { IconArrow } from "./icons";
import { EASE } from "./motion";
import { WaxSeal } from "./WaxSeal";

const HOLD_MS = 1400;
const RELEASE_MS = 320;

/**
 * "Press and hold to seal": a ring fills around the wax while the button is held, then the wax stamps down.
 * Letting go early lets the ring drain and cancels. A plain "Seal it now" tap sits beside it (and is all there is for people
 * who ask for less motion), so nobody needs to hold anything. The ring turns by transform only.
 */
export function HoldSeal({ onSeal, busy, label = "Press and hold to seal" }: { onSeal: () => void; busy: boolean; label?: string }) {
  const calm = useReducedMotion();
  const right = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const p = useRef(0);
  const holding = useRef(false);
  const raf = useRef(0);
  const last = useRef(0);
  const fired = useRef(false);
  const [stamped, setStamped] = useState(false);
  const [held, setHeld] = useState(false);

  const draw = useCallback(() => {
    const v = p.current;
    if (right.current) right.current.style.transform = `rotate(${-135 + 360 * Math.min(v, 0.5)}deg)`;
    if (left.current) left.current.style.transform = `rotate(${45 + 360 * Math.max(v - 0.5, 0)}deg)`;
  }, []);
  const run = useCallback(() => {
    if (raf.current) return;
    last.current = performance.now();
    const step = (now: number) => {
      raf.current = 0;
      const dt = now - last.current;
      last.current = now;
      p.current = Math.max(0, Math.min(1, p.current + (holding.current ? dt / HOLD_MS : -dt / RELEASE_MS)));
      draw();
      if (p.current >= 1 && !fired.current) {
        fired.current = true;
        holding.current = false;
        setHeld(false);
        setStamped(true);
        setTimeout(onSeal, 650); // the wax lands, then the sealing begins
        return;
      }
      if (holding.current || p.current > 0) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [draw, onSeal]);
  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(raf.current);
  }, [draw]);
  // if the tab is hidden mid-hold, let go
  useEffect(() => {
    const f = () => document.hidden && ((holding.current = false), setHeld(false));
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  const start = () => {
    if (busy || fired.current) return;
    holding.current = true;
    setHeld(true);
    run();
  };
  const stop = () => {
    holding.current = false;
    setHeld(false);
    run();
  };

  if (calm)
    return (
      <Button arrow="forward" onClick={onSeal} disabled={busy}>
        {busy ? "Sealing…" : "Seal it"}
      </Button>
    );

  return (
    <div className="holdseal">
      <button
        type="button"
        className={`hold-btn ${held ? "held" : ""}`}
        disabled={busy}
        aria-label={`${label}. Or use the button below to seal with one tap.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => (e.key === " " || e.key === "Enter") && stop()}
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="hold-ring" aria-hidden="true">
          <span className="ring-track" />
          <span className="ring-half r">
            <span ref={right} className="ring-fill" style={{ left: "-100%" }} />
          </span>
          <span className="ring-half l">
            <span ref={left} className="ring-fill" style={{ left: 0 }} />
          </span>
          <m.span className="hold-wax" initial={false} animate={stamped ? { scale: [1.9, 0.92, 1], y: [-16, 2, 0], opacity: [0.2, 1, 1] } : { scale: held ? 0.9 : 1, y: 0, opacity: 1 }} transition={stamped ? { duration: 0.55, ease: EASE } : { duration: 0.25 }}>
            <WaxSeal />
          </m.span>
        </span>
        <span className="hold-text">{busy ? "Sealing…" : stamped ? "Sealed" : held ? "Keep holding…" : label}</span>
      </button>
      <button type="button" className="link hold-tap" disabled={busy || stamped} onClick={onSeal}>
        Seal it now with one tap <IconArrow size={13} />
      </button>
    </div>
  );
}
