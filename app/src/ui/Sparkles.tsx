import { m, useReducedMotion } from "framer-motion";
import { sparkle } from "./motion";

// fixed positions (not random), so the picture is the same every time and in tests
const SPOTS = [
  { l: 8, t: 58, s: 14 },
  { l: 18, t: 22, s: 10 },
  { l: 26, t: 70, s: 18 },
  { l: 36, t: 12, s: 12 },
  { l: 44, t: 46, s: 9 },
  { l: 52, t: 80, s: 16 },
  { l: 60, t: 18, s: 11 },
  { l: 68, t: 62, s: 15 },
  { l: 76, t: 30, s: 9 },
  { l: 84, t: 74, s: 13 },
  { l: 91, t: 40, s: 17 },
  { l: 14, t: 88, s: 9 },
  { l: 48, t: 94, s: 11 },
  { l: 80, t: 10, s: 12 },
];

const STAR = "M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z";

/** Gentle floating sparkles (soft golden stars drifting upward and fading). Not confetti. */
export function Sparkles() {
  const calm = useReducedMotion();
  return (
    <div className="sparkles" aria-hidden="true">
      {SPOTS.map((p, i) =>
        calm ? (
          <svg key={i} className="sparkle" style={{ left: `${p.l}%`, top: `${p.t}%`, width: p.s, opacity: 0.35 }} viewBox="0 0 24 24">
            <path d={STAR} fill="#e2b25a" />
          </svg>
        ) : (
          <m.svg key={i} className="sparkle" style={{ left: `${p.l}%`, top: `${p.t}%`, width: p.s }} viewBox="0 0 24 24" initial={{ opacity: 0 }} animate={sparkle(i).animate} transition={sparkle(i).transition}>
            <path d={STAR} fill="#e2b25a" />
          </m.svg>
        ),
      )}
    </div>
  );
}
