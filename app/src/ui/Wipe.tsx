import { m } from "framer-motion";
import type { ReactNode } from "react";
import { EASE } from "./motion";

/**
 * Reveals what is inside from left to right, like a line being written, using only movement: a window slides across
 * while its content slides back by the same amount, so the content itself stays put. (Under reduced motion it is simply shown.)
 */
export function Wipe({ children, duration = 2.2, delay = 0, play = true, className = "" }: { children: ReactNode; duration?: number; delay?: number; play?: boolean; className?: string }) {
  const t = { duration, delay, ease: EASE };
  return (
    <div className={`wipe ${className}`}>
      <m.div className="wipe-win" initial={{ x: "-101%" }} animate={{ x: play ? "0%" : "-101%" }} transition={t}>
        <m.div className="wipe-in" initial={{ x: "101%" }} animate={{ x: play ? "0%" : "101%" }} transition={t}>
          {children}
        </m.div>
      </m.div>
    </div>
  );
}
