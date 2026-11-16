import { AnimatePresence, m } from "framer-motion";
import { pillIn } from "./motion";

/** What you've already decided, shrunk into small pills at the top. */
export function Pills({ items }: { items: { key: string; label: string }[] }) {
  return (
    <ul className="pills" aria-label="So far">
      <AnimatePresence initial={false}>
        {items.map((p) => (
          <m.li key={p.key} className="pill" {...pillIn}>
            {p.label}
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
