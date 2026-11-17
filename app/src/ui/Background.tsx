import { useEffect, useRef } from "react";
import { startParallax } from "../lib/parallax";

const DEPTHS = ["far", "mid", "near"] as const;

/**
 * Soft pink-blush clouds on pearl, in three layers that drift very slowly and shift with scroll, pointer and tilt.
 * The clouds are pre-rendered (nothing blurs live) and tinted by the time of day (lib/sky.ts); a few faint stars appear at night.
 * `night` pins the night look, for the intro film.
 */
export function Background({ night = false }: { night?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? startParallax(ref.current) : undefined), []);
  return (
    <div ref={ref} className={night ? "bg bg-night" : "bg"} aria-hidden="true">
      <div className="bg-stars" />
      {DEPTHS.map((d) => (
        <div key={d} className={`cl cl-${d}`}>
          <div className="cl-drift">
            <i className="cl-shade" />
            <i className="cl-lit" />
          </div>
        </div>
      ))}
    </div>
  );
}
