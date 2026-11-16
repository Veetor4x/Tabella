import { m, useAnimationControls, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef } from "react";
import { stackFly, stackFlyTransition, stackRest } from "./motion";

export interface StackItem {
  id: number;
  letter: string;
  ready: boolean;
}

const TILT = [-7, 2, 8];

function MiniCard({ item, tilt, fly }: { item: StackItem; tilt: number; fly: { x: number; y: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const flying = !!fly && !reduce;

  // A newly added card starts where the "Add another person" button was and flies into the stack.
  useLayoutEffect(() => {
    if (!flying || !ref.current || !fly) return;
    const r = ref.current.getBoundingClientRect();
    controls.set(stackFly(fly.x - (r.left + r.width / 2), fly.y - (r.top + r.height / 2)));
    void controls.start({ ...stackRest(tilt), transition: stackFlyTransition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <m.div
      ref={ref}
      className="mini glass"
      initial={flying ? { opacity: 0 } : stackRest(tilt)}
      animate={flying ? controls : stackRest(tilt)}
    >
      <span className="mini-letter">{item.letter}</span>
      {item.ready && <span className="mini-check">✓</span>}
    </m.div>
  );
}

/** A small stack of the people chosen so far. Decorative: the real list is the cards below it. */
export function MiniStack({ items, fly }: { items: StackItem[]; fly: { id: number; x: number; y: number } | null }) {
  return (
    <div className="stack" aria-hidden="true">
      {items.map((it, i) => (
        <MiniCard key={it.id} item={it} tilt={TILT[i % TILT.length]!} fly={fly && fly.id === it.id ? fly : null} />
      ))}
    </div>
  );
}
