import { AnimatePresence, m } from "framer-motion";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { dismiss, getToasts, serverToasts, subscribeToasts } from "../lib/notices";
import { EASE } from "./motion";

const GAP = 8;

/**
 * Gentle notices at the top of the screen. A new one slides in from above and the older ones slide down to make room (each is
 * moved by a transform to its place, so only movement and fading happen). Tap one to put it away. Calm for reduced motion: they just fade.
 */
export function Notices() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, serverToasts);
  const els = useRef(new Map<number, HTMLDivElement>());
  const [heights, setHeights] = useState<Record<number, number>>({});
  useLayoutEffect(() => {
    const next: Record<number, number> = {};
    toasts.forEach((t) => (next[t.id] = els.current.get(t.id)?.offsetHeight ?? heights[t.id] ?? 52));
    if (toasts.some((t) => next[t.id] !== heights[t.id])) setHeights(next);
  }, [toasts, heights]);
  let y = 0;
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const at = y;
          y += (heights[t.id] ?? 52) + GAP;
          return (
            <m.div
              key={t.id}
              ref={(el: HTMLDivElement | null) => {
                if (el) els.current.set(t.id, el);
                else els.current.delete(t.id);
              }}
              className="toast glass"
              initial={{ opacity: 0, y: at - 28 }}
              animate={{ opacity: 1, y: at }}
              exit={{ opacity: 0, y: at - 12, transition: { duration: 0.28 } }}
              transition={{ duration: 0.55, ease: EASE }}
              onClick={() => dismiss(t.id)}
            >
              {t.text}
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
