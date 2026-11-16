import { m } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { EASE } from "./motion";

/**
 * The countdown ring. Made of two half-rings that turn (transform only), so it can run smoothly on a phone:
 * `fraction` 1 = full (just checked in), 0 = empty. When it changes, the ring sweeps there calmly,
 * the right half first when filling and the left half first when emptying.
 */
export function Ring({ fraction, tone = "ink", size = 200, thickness = 5, children, label }: { fraction: number; tone?: "ink" | "alert" | "faint"; size?: number; thickness?: number; children?: ReactNode; label?: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  const right = -135 + 360 * Math.min(f, 0.5);
  const left = 45 + 360 * Math.max(f - 0.5, 0);
  const prev = useRef({ right, left });
  const dr = Math.abs(right - prev.current.right), dl = Math.abs(left - prev.current.left);
  const filling = right + left > prev.current.right + prev.current.left;
  prev.current = { right, left };
  const total = Math.min(2.2, 0.3 + (dr + dl) / 280); // a small change is quick, a full reset is slow and calm
  const share = (d: number) => (dr + dl === 0 ? 0 : (d / (dr + dl)) * total);
  const tRight = { duration: share(dr), ease: EASE, delay: filling ? 0 : share(dl) };
  const tLeft = { duration: share(dl), ease: EASE, delay: filling ? share(dr) : 0 };
  const color = tone === "alert" ? "var(--alert)" : tone === "faint" ? "var(--faint)" : "var(--ink)";
  const border = `${thickness}px`;
  return (
    <div className="ring" role="img" aria-label={label} style={{ width: size, height: size, ["--ring" as string]: color, ["--rt" as string]: border }}>
      <span className="ring-track" />
      <span className="ring-half r">
        <m.span className="ring-fill" style={{ left: "-100%" }} initial={false} animate={{ rotate: right }} transition={tRight} />
      </span>
      <span className="ring-half l">
        <m.span className="ring-fill" style={{ left: 0 }} initial={false} animate={{ rotate: left }} transition={tLeft} />
      </span>
      <div className="ring-center">{children}</div>
    </div>
  );
}
