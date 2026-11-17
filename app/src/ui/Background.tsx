import { useEffect, useRef } from "react";
import { startParallax } from "../lib/parallax";

/**
 * A calm pearl sky with fine grain and soft blush clouds, drifting slowly and for ever.
 *
 * Light: one main cloud near the middle and a few fainter, smaller ones near the edges. Each cloud is two copies of one soft picture
 * that cross-fade as they drift, so there is always exactly one cloud, moving the whole time and never jumping. The far clouds are
 * fainter and slower than the near one (60 to 90 seconds for a full pass).
 * Dark: three tiling layers of clouds sliding sideways without a seam (unchanged).
 *
 * Both shift a little with the scroll, the pointer and the phone's tilt. Everything is pre-rendered (nothing blurs live) and tinted by the
 * time of day (lib/sky.ts); a few faint stars show at night. `main={false}` leaves out the near, big cloud (the front page has its own under
 * the hero). `night` pins the dark look, for the intro film.
 */
export function Background({ night = false, main = true }: { night?: boolean; main?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? startParallax(ref.current) : undefined), []);
  const tiles = (name: "far" | "mid" | "near", depth: number) => (
    <div className={`cl cl-${name}`} data-depth={depth} key={name}>
      <div className="cl-drift">
        <i className="cl-tile" />
      </div>
    </div>
  );
  const pair = (name: string) => [<i key="a" className={`lc lc-${name}`} />, <i key="b" className={`lc lc2 lc-${name}`} />];
  return (
    <div ref={ref} className={night ? "bg bg-night" : "bg"} aria-hidden="true">
      <div className="bg-stars" />
      <div className="bgd">
        {tiles("far", 0.35)}
        {tiles("mid", 0.75)}
        {main && tiles("near", 1.5)}
      </div>
      <div className="bgl">
        <div className="cl" data-depth={0.35}>
          {pair("a")}
          {pair("c")}
        </div>
        <div className="cl" data-depth={0.75}>
          {pair("b")}
        </div>
        {main && (
          <div className="cl" data-depth={1.5}>
            {pair("main")}
          </div>
        )}
      </div>
    </div>
  );
}
