import { useEffect, useRef } from "react";
import { startParallax } from "../lib/parallax";

/**
 * A calm pearl sky with fine grain, and soft blush clouds that drift slowly and for ever: three layers, the far ones slower and
 * fainter than the near ones, each sliding one picture-width in 60 to 90 seconds and starting again without a seam. They also shift a
 * little with the scroll, the pointer and the phone's tilt. The clouds are pre-rendered (nothing blurs live) and tinted by the time of
 * day (lib/sky.ts); a few faint stars appear at night. `main={false}` leaves out the near layer with the big cloud (the front page
 * has its own under the hero). `night` pins the night look, for the intro film.
 */
export function Background({ night = false, main = true }: { night?: boolean; main?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? startParallax(ref.current) : undefined), []);
  const layer = (name: "far" | "mid" | "near") => (
    <div className={`cl cl-${name}`} key={name}>
      <div className="cl-drift">
        <i className="cl-tile" />
      </div>
    </div>
  );
  return (
    <div ref={ref} className={night ? "bg bg-night" : "bg"} aria-hidden="true">
      <div className="bg-stars" />
      {layer("far")}
      {layer("mid")}
      {main && layer("near")}
    </div>
  );
}
