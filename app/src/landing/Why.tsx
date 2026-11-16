import { m } from "framer-motion";
import { Headline } from "../ui/Headline";
import { EASE } from "../ui/motion";
import { Reveal } from "./Reveal";

const draw = (i: number) => ({ initial: { scaleX: 0 }, whileInView: { scaleX: 1 }, viewport: { once: true }, transition: { duration: 0.9, ease: EASE, delay: 0.4 + i * 0.18 } });

function Words() {
  return (
    <div className="why-art words" aria-hidden="true">
      {[0.9, 0.7, 0.82, 0.4].map((w, i) => (
        <m.span key={i} style={{ width: `${w * 100}%`, opacity: i === 3 ? 0.35 : 1 }} {...draw(i)} />
      ))}
    </div>
  );
}
function Locked() {
  return (
    <div className="why-art locked" aria-hidden="true">
      <svg viewBox="0 0 120 80" width="120" height="80" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <rect x="14" y="30" width="92" height="42" rx="6" />
        <path d="M14 42h92" />
        <path d="M26 30v-6a6 6 0 0 1 6-6h56a6 6 0 0 1 6 6v6" />
      </svg>
      <m.span className="lock-dot" initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE, delay: 0.5 }} />
      <m.span className="lock-ask" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE, delay: 0.9 }}>
        where?
      </m.span>
    </div>
  );
}
function Decades() {
  return (
    <div className="why-art decades" aria-hidden="true">
      <div className="d-track">
        <m.span className="d-fill" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE, delay: 0.4 }} />
        <m.span className="d-dot" initial={{ x: "0%" }} whileInView={{ x: "100%" }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE, delay: 0.4 }} />
      </div>
      <div className="d-ticks">
        <span>today</span>
        <span>10 years</span>
        <span>30 years</span>
      </div>
    </div>
  );
}

const CARDS = [
  { art: <Words />, title: "Words that never get said.", body: "The thing you meant to tell them, and kept putting off." },
  { art: <Locked />, title: "Things locked away when no one knows where they are.", body: "A door code, a box, a place. Gone because nobody knew." },
  { art: <Decades />, title: "Letters meant for decades need protection that lasts decades.", body: "Even against future super-computers." },
];

export function Why() {
  return (
    <section className="land-section" id="why">
      <p className="eyebrow">Why it matters</p>
      <Headline text="Some words should *wait* for the right day." as="h2" inView className="h2" />
      <div className="why-grid">
        {CARDS.map((c, i) => (
          <Reveal key={i} delay={i * 0.12} className="why-card glass">
            {c.art}
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
