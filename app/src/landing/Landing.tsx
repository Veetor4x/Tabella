import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { getIntroChoice, setIntroChoice, type IntroChoice } from "../lib/intro";
import { Background } from "../ui/Background";
import { SoundWave } from "../ui/SoundWave";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Headline } from "../ui/Headline";
import { IconArrow, IconPlay } from "../ui/icons";
import { fadeUp } from "../ui/motion";
import { Demo } from "./Demo";
import type { FilmId } from "./film";
import { IntroPlayer, IntroPrompt } from "./Intro";
import { startIntroSound } from "./sfx";
import { preloadVoice, unlockVoice } from "./voice";
import { HeroLetter } from "./HeroLetter";
import { Faq } from "./Faq";
import { Perch } from "./Perch";
import { Reveal } from "./Reveal";
import { Trust } from "./Trust";
import { Why } from "./Why";

const REPO = "https://github.com/Veetor4x/Tabella";

/** The front page. The owner's flow lives at /write. */
export function Landing() {
  // First visit only: ask once whether to show the intro, and remember the answer.
  const [choice, setChoice] = useState<IntroChoice | null | "loading">("loading");
  const [playing, setPlaying] = useState(false);
  const [film, setFilm] = useState<FilmId>("surprise"); // the first-visit intro and "Watch intro" play the Surprise film
  useEffect(() => {
    const c = getIntroChoice();
    setChoice(c);
    if (c === null) preloadVoice(9, "s");
  }, []);
  const start = (remember: boolean, f: FilmId = "surprise") => {
    unlockVoice(f === "surprise" ? 9 : 8, f === "surprise" ? "s" : ""); // from the tap itself: this is what lets the voice play
    startIntroSound(); // and the effects and the music bed
    if (remember) {
      setIntroChoice("yes");
      setChoice("yes");
    }
    setFilm(f);
    setPlaying(true);
  };
  /** From the Surprise film's end card: play the other film, from the start. */
  const other = () => {
    unlockVoice(8, "");
    setFilm("invite");
    setTimeout(() => startIntroSound(), 1000); // the first film's sound stops as it leaves; this brings the music back for the next
  };
  const skip = () => {
    setIntroChoice("skip");
    setChoice("skip");
  };
  const close = useCallback(() => setPlaying(false), []);

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className="root land">
          <Background />
          <header className="land-nav">
            <a className="brand-name" href="/" aria-label="Tabella, home">
              Tabella
            </a>
            <nav aria-label="Sections">
              <button type="button" className="watch-intro" onClick={() => start(false)}>
                <IconPlay size={14} />
                <span>Watch intro</span>
              </button>
              <a href="#why">Why</a>
              <a href="#how">How</a>
              <a href="#trust">Trust</a>
              <ThemeToggle />
              <SoundWave />
            </nav>
          </header>

          <main>
            <section className="hero">
              <div className="hero-copy">
                <Headline text="Sealed today. Opened when it *matters*." className="hero-h" />
                <m.p className="hero-lead" {...fadeUp(0.9)}>
                  A letter for the people you love, locked today and opened only for them, and only if you go quiet.
                </m.p>
                <m.div className="hero-actions" {...fadeUp(1.1)}>
                  <a className="btn primary" href="/write">
                    <span>Start here</span>
                    <IconArrow size={18} />
                  </a>
                  <a className="btn glass" href="#how">
                    <span>See how it works</span>
                  </a>
                </m.div>
              </div>
              <m.div className="hero-art" {...fadeUp(0.6)}>
                <HeroLetter />
                <Perch />
              </m.div>
            </section>

            <Why />
            <Demo />

            <section className="land-section start" id="start">
              <Reveal>
                <p className="start-lead">It takes a few minutes. No account needed.</p>
                <a className="btn primary big" href="/write">
                  <span>Start here</span>
                  <IconArrow size={20} />
                </a>
              </Reveal>
            </section>

            <Trust />
            <Faq />
          </main>

          <footer className="land-footer">
            <p className="build">
              <strong>QoreChain</strong> · Build Before Q-Day
            </p>
            <p>
              <a href={REPO} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <span aria-hidden="true"> · </span>
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
                Apache-2.0 licence
              </a>
            </p>
            <p className="fine">A demo on a test network. Please don't write real secrets yet.</p>
          </footer>
          {choice === null && !playing && <IntroPrompt onYes={() => start(true)} onSkip={skip} />}
          <AnimatePresence>{playing && <IntroPlayer key={film} film={film} onClose={close} onOther={other} />}</AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
