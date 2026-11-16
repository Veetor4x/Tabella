import { m } from "framer-motion";
import { forwardRef } from "react";
import { headlineContainer, maskWord } from "./motion";

/**
 * The big editorial headline. Each word slides up through its own mask, one after another.
 * Write *word* to set a word in italics. Screen readers get the sentence in one piece.
 */
export const Headline = forwardRef<HTMLHeadingElement, { text: string }>(function Headline({ text }, ref) {
  const words = text.split(" ");
  return (
    <m.h1 ref={ref} tabIndex={-1} className="headline" aria-label={text.replace(/\*/g, "")} variants={headlineContainer} initial="hidden" animate="show">
      {words.map((w, i) => {
        const italic = w.startsWith("*") && /\*\W*$/.test(w);
        const clean = w.replace(/\*/g, "");
        return (
          <span key={i}>
            <span className="mask" aria-hidden="true">
              <m.span className={italic ? "word it" : "word"} variants={maskWord}>
                {clean}
              </m.span>
            </span>{" "}
          </span>
        );
      })}
    </m.h1>
  );
});
