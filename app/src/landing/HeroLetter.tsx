import { m, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { EASE } from "../ui/motion";
import { WaxSeal } from "../ui/WaxSeal";

type Phase = "write" | "fold" | "seal" | "hold";
const ORDER: Phase[] = ["write", "fold", "seal", "hold"];
const LENGTH: Record<Phase, number> = { write: 3400, fold: 1700, seal: 1500, hold: 2600 };

/**
 * A glass letter card floats, folds into an envelope and is sealed, over and over.
 * Transform and opacity only. Under reduced motion it rests as a sealed envelope.
 */
export function HeroLetter() {
  const calm = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(calm ? "hold" : "write");

  useEffect(() => {
    if (calm) return setPhase("hold");
    let i = 0, t: ReturnType<typeof setTimeout>;
    const next = () => {
      if (document.hidden) {
        t = setTimeout(next, 800); // paused while the tab is hidden
        return;
      }
      i = (i + 1) % ORDER.length;
      setPhase(ORDER[i]!);
      t = setTimeout(next, LENGTH[ORDER[i]!]);
    };
    setPhase("write");
    t = setTimeout(next, LENGTH.write);
    return () => clearTimeout(t);
  }, [calm]);

  const folded = phase !== "write";
  const sealed = phase === "seal" || phase === "hold";
  return (
    <div className="hero-stage" role="img" aria-label="A letter folds into an envelope and is sealed with wax">
      <div className="hero-float">
        <m.div className="env" initial={false} animate={{ opacity: folded ? 1 : 0, y: folded ? 0 : 24 }} transition={{ duration: 0.7, ease: EASE, delay: folded ? 0.25 : 0 }}>
          <div className="env-body glass" />
          <m.div className="env-flap" initial={false} animate={{ rotateX: folded ? 0 : 180 }} transition={{ duration: 0.8, ease: EASE, delay: folded ? 0.7 : 0 }} />
          <m.div className="env-seal" initial={false} animate={{ opacity: sealed ? 1 : 0, scale: sealed ? 1 : 1.8, y: sealed ? 0 : -26 }} transition={{ duration: 0.7, ease: EASE }}>
            <WaxSeal />
          </m.div>
        </m.div>
        <m.div className="paper glass" initial={false} animate={folded ? { opacity: 0, scale: 0.72, y: 54 } : { opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <span className="paper-hello">Dear Mia,</span>
          {[0.92, 0.78, 0.86, 0.5].map((w, i) => (
            <m.span key={i} className="paper-line" style={{ width: `${w * 100}%` }} initial={false} animate={{ scaleX: phase === "write" ? 1 : 0.2 }} transition={{ duration: 0.9, ease: EASE, delay: phase === "write" ? 0.25 + i * 0.35 : 0 }} />
          ))}
        </m.div>
      </div>
    </div>
  );
}
