import { m } from "framer-motion";
import type { ReactNode } from "react";
import { EASE } from "../ui/motion";

/** Fades and rises into place the first time it scrolls into view. (Calm version for reduced motion: just a fade.) */
export function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}
