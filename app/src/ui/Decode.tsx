import { useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef } from "react";

const SOFT = "·∙•◦˙";
const soft = (n: number) => Array.from({ length: n }, () => SOFT[Math.floor(Math.random() * SOFT.length)]).join("");

/**
 * A letter's text decoding from soft marks into words, left to right and top to bottom, a few words at a time.
 * The real words are in the page from the start (so the page never shifts, and screen readers read them as normal);
 * the soft marks sit on top and fade as each word arrives. Under reduced motion the words are simply there.
 */
export function DecodedText({ text, onDone }: { text: string; onDone?: () => void }) {
  const calm = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (calm) {
      done.current?.();
      return;
    }
    el.classList.add("run");
    const words = Array.from(el.querySelectorAll<HTMLElement>(".dw"));
    const marks = words.map((w) => w.querySelector<HTMLElement>(".dw-sym")!);
    const total = Math.min(3600, 1100 + words.length * 34);
    const step = (total - 700) / Math.max(1, words.length);
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    let finished = false;
    const tick = (now: number) => {
      const t = now - t0;
      let left = 0;
      words.forEach((w, i) => {
        if (w.classList.contains("on")) return;
        if (t > 350 + i * step) w.classList.add("on");
        else {
          left++;
          if (now - last > 120) marks[i]!.textContent = soft(Math.max(2, w.dataset.len ? Number(w.dataset.len) : 3));
        }
      });
      if (now - last > 120) last = now;
      if (left > 0) raf = requestAnimationFrame(tick);
      else if (!finished) {
        finished = true;
        setTimeout(() => {
          el.classList.add("settled"); // the soft marks leave the page altogether
          done.current?.();
        }, 800);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, calm]);

  return (
    <div ref={root} className="decode">
      {text.split("\n").map((line, i) =>
        line.trim() ? (
          <p key={i}>
            {line.split(/(\s+)/).map((w, j) =>
              /^\s+$/.test(w) || w === "" ? (
                w
              ) : (
                <span key={j} className="dw" data-len={w.length}>
                  <span className="dw-real">{w}</span>
                  <span className="dw-sym" aria-hidden="true">
                    {SOFT[0]!.repeat(w.length)}
                  </span>
                </span>
              ),
            )}
          </p>
        ) : (
          <br key={i} />
        ),
      )}
    </div>
  );
}
