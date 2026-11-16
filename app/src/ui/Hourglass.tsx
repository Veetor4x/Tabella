import { m, useAnimationControls, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { grain, hourglassWobble, sandLevel, sandTransition } from "./motion";

const GLASS = "M22 8 H78 C78 40 62 58 54 70 C62 82 78 100 78 132 H22 C22 100 38 82 46 70 C38 58 22 40 22 8 Z";

/** An hourglass whose lower bulb fills with sand as a longer wait is picked (level 0 to 1). */
export function Hourglass({ level }: { level: number }) {
  const reduce = useReducedMotion();
  const wobble = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reduce) void wobble.start({ ...hourglassWobble, transition: { duration: 0.7, ease: "easeInOut" } });
  }, [level, reduce, wobble]);

  return (
    <m.svg className="hourglass" viewBox="0 0 100 140" aria-hidden="true" animate={wobble}>
      <defs>
        <clipPath id="hg-clip">
          <path d={GLASS} />
        </clipPath>
        <linearGradient id="hg-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7b866" />
          <stop offset="1" stopColor="#c98a3a" />
        </linearGradient>
      </defs>
      <path d={GLASS} className="hg-glass" />
      <g clipPath="url(#hg-clip)">
        {/* sand left in the top bulb (drains) and sand collected in the bottom bulb (fills): both are scaled, nothing else */}
        <m.rect x="0" y="8" width="100" height="62" fill="url(#hg-sand)" style={{ originY: 1 }} initial={sandLevel(1 - level)} animate={sandLevel(1 - level)} transition={sandTransition} />
        <m.rect x="0" y="70" width="100" height="62" fill="url(#hg-sand)" style={{ originY: 1 }} initial={sandLevel(level)} animate={sandLevel(level)} transition={sandTransition} />
      </g>
      {!reduce &&
        [0, 1, 2].map((i) => (
          <m.circle key={i} cx="50" cy="72" r="1.7" fill="#c98a3a" animate={grain(i).animate} transition={grain(i).transition} />
        ))}
      <path d={GLASS} className="hg-outline" />
    </m.svg>
  );
}
