import { useEffect, useRef } from "react";
import { startParallax } from "../lib/parallax";

/** One cloud: a lighter mask and a pinker mask, tinted by the time of day. */
const Cloud = ({ name }: { name: "main" | "a" | "b" | "c" | "a2" }) => (
  <i className={`pf pf-${name}`}>
    <b className="cl-shade" />
    <b className="cl-lit" />
  </i>
);

/**
 * A calm pearl sky with fine grain. One soft blush cloud in the middle, and a few fainter, smaller ones at the edges that sit
 * further away: the far ones move least with the scroll, the pointer and the phone's tilt. The clouds are pre-rendered (nothing
 * blurs live), tinted by the time of day (lib/sky.ts), and a few faint stars appear at night.
 * `main={false}` leaves the middle cloud out (the front page has its own, in the hero). `night` pins the night look, for the intro film.
 */
export function Background({ night = false, main = true }: { night?: boolean; main?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? startParallax(ref.current) : undefined), []);
  return (
    <div ref={ref} className={night ? "bg bg-night" : "bg"} aria-hidden="true">
      <div className="bg-stars" />
      <div className="cl cl-far">
        <Cloud name="a" />
        <Cloud name="c" />
      </div>
      <div className="cl cl-mid">
        <Cloud name="b" />
        <Cloud name="a2" />
      </div>
      {main && (
        <div className="cl cl-near">
          <Cloud name="main" />
        </div>
      )}
    </div>
  );
}
