import { m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/share";
import { IconCheck, IconCopy } from "./icons";
import { EASE } from "./motion";

/**
 * A copy button that turns into a check mark and says "Copied" for a moment. The icon and the words cross over with a small
 * turn and fade (transform and opacity only); under reduced motion they just swap.
 */
export function CopyButton({ text, label = "Copy", className = "btn glass share-btn", onCopied }: { text: string; label?: string; className?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const t = { duration: 0.4, ease: EASE };
  return (
    <button
      type="button"
      className={`${className} copy-btn ${done ? "done" : ""}`}
      aria-label={done ? "Copied" : label}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setDone(true);
        onCopied?.();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 2400);
      }}
    >
      <span className="copy-ico" aria-hidden="true">
        <m.span className="copy-a" initial={false} animate={{ opacity: done ? 0 : 1, scale: done ? 0.4 : 1, rotate: done ? -50 : 0 }} transition={t}>
          <IconCopy size={15} />
        </m.span>
        <m.span className="copy-b" initial={false} animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.4, rotate: done ? 0 : 50 }} transition={t}>
          <IconCheck size={15} />
        </m.span>
      </span>
      <span className="copy-words" aria-live="polite">
        <m.span className="copy-w1" initial={false} animate={{ opacity: done ? 0 : 1, y: done ? -8 : 0 }} transition={t}>
          {label}
        </m.span>
        <m.span className="copy-w2" initial={false} animate={{ opacity: done ? 1 : 0, y: done ? 0 : 8 }} transition={t}>
          Copied
        </m.span>
      </span>
    </button>
  );
}
