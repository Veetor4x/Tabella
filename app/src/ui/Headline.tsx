import { m } from "framer-motion";
import { forwardRef } from "react";
import { headlineContainer, wordBlur, wordSharp } from "./motion";

/**
 * The big editorial headline. Each word comes into focus, one after another: a soft copy fades out as the sharp word fades in.
 * Write *word* to set a word in italics. Screen readers get the sentence in one piece. (Under reduced motion the words just fade.)
 */
export const Headline = forwardRef<HTMLHeadingElement, { text: string; as?: "h1" | "h2"; inView?: boolean; className?: string }>(function Headline({ text, as = "h1", inView = false, className = "" }, ref) {
  const Tag = as === "h2" ? m.h2 : m.h1;
  const words = text.split(" ");
  return (
    <Tag
      ref={ref}
      tabIndex={-1}
      className={`headline ${className}`}
      aria-label={text.replace(/\*/g, "")}
      variants={headlineContainer}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "0px 0px -12% 0px" } } : { animate: "show" })}
    >
      {words.map((w, i) => {
        const italic = w.startsWith("*") && /\*\W*$/.test(w);
        const clean = w.replace(/\*/g, "");
        const cls = italic ? "it" : "";
        return (
          <span key={i}>
            <span className="hw" aria-hidden="true">
              <m.span className={`hw-s ${cls}`} variants={wordSharp}>
                {clean}
              </m.span>
              <m.span className={`hw-b ${cls}`} variants={wordBlur}>
                {clean}
              </m.span>
            </span>{" "}
          </span>
        );
      })}
    </Tag>
  );
});
