import { m } from "framer-motion";
import { useEffect } from "react";
import { Headline } from "../ui/Headline";
import { IconCheck, IconClock, IconLetter, IconPeople, IconShield } from "../ui/icons";
import { Reveal } from "./Reveal";

const CLAIMS = [
  { icon: <IconLetter />, title: "Sealed on your device.", body: "Your letter is locked on your phone before it leaves. {{We never see the words.}}" },
  { icon: <IconPeople />, title: "Two halves.", body: "Your loved ones hold one half from day one, and the other half is released only if you go quiet. {{Nobody can open it early}}, not even them." },
  { icon: <IconShield />, title: "The Postman can't read it.", body: "Our delivery helper only carries a half. It {{can't read your letter}} or pretend to be you." },
  { icon: <IconCheck />, title: "You stay in control.", body: "{{Check in with one tap.}} A guardian can pause it if you're just ill or away, and you can cancel any time before it opens. Or skip all that: pick a date, and the letter opens on that day, like a time capsule." },
  { icon: <IconPeople />, title: "Found by email, for now.", body: "If you keep it a surprise, our Postman emails them {{when the time comes}}, and a backup person you name if they can't be reached. Text and call reminders are coming soon." },
  { icon: <IconClock />, title: "Built for the future.", body: "It uses new protection designed to stay safe even against {{future quantum computers}}, on the QoreChain network." },
];

const LIMITS = [
  "This is a test-network version.",
  "If someone loses their card, that copy can't be recovered.",
  "Please write where things are, never passwords or recovery phrases.",
  "Parts of the protection are still awaiting outside review.",
];

/** Turns {{key phrase}} into a highlighter-marked span; the sweep plays when it scrolls into view. */
function marked(body: string) {
  return body.split(/(\{\{.*?\}\})/g).map((part, i) => (part.startsWith("{{") ? <mark key={i} className="hl">{part.slice(2, -2)}</mark> : part));
}

export function Trust() {
  // a soft wax-red highlighter sweeps behind each key phrase as it scrolls in
  useEffect(() => {
    const marks = Array.from(document.querySelectorAll<HTMLElement>("#trust .hl"));
    if (typeof IntersectionObserver === "undefined") return marks.forEach((el) => el.classList.add("on"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("on");
          io.unobserve(e.target);
        }),
      { threshold: 0.9, rootMargin: "0px 0px -12% 0px" },
    );
    marks.forEach((el, i) => {
      el.style.setProperty("--hl-delay", `${(i % 2) * 0.25 + 0.35}s`);
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return (
    <section className="land-section" id="trust">
      <p className="eyebrow">Why you can trust it</p>
      <Headline text="In plain words, and *honestly*." as="h2" inView className="h2" />
      <div className="trust-grid">
        {CLAIMS.map((c, i) => (
          <Reveal key={c.title} delay={(i % 2) * 0.1} className="trust-card glass">
            <span className="trust-icon">{c.icon}</span>
            <h3>{c.title}</h3>
            <p>{marked(c.body)}</p>
          </Reveal>
        ))}
        <Reveal delay={0.1} className="trust-card limits">
          <h3>Honest limits</h3>
          <ul>
            {LIMITS.map((l, i) => (
              <m.li key={l} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 + i * 0.12 }}>
                {l}
              </m.li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal>
        <details className="curious glass">
          <summary>For the curious</summary>
          <dl>
            <dt>ML-KEM-1024</dt>
            <dd>The post-quantum scheme (NIST FIPS 203) that seals each half of the letter's key to the person meant to open it.</dd>
            <dt>ML-DSA-87</dt>
            <dd>The post-quantum signature scheme (NIST FIPS 204). A check-in, a pause or a cancel only counts if it carries a valid signature from the owner or the guardian.</dd>
            <dt>On-chain checks</dt>
            <dd>The registry contract on QoreChain verifies every one of those signatures itself before it changes anything, so the helper can submit a request but cannot forge one.</dd>
            <dt>The two-key split</dt>
            <dd>The letter is locked with one key, split into two parts that must be combined. Part A is sealed to the loved ones from day one. Part B is sealed to the Postman, who re-seals it to them only once the letter is released.</dd>
            <dt>Not audited yet</dt>
            <dd>This code and the QoreChain post-quantum features have not had an independent security review.</dd>
          </dl>
        </details>
      </Reveal>
    </section>
  );
}
