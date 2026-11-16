import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Headline } from "../ui/Headline";
import { IconArrow, IconBack, IconChevL, IconChevR, IconPause, IconPlay, IconReplay, IconSound } from "../ui/icons";
import { EASE } from "../ui/motion";
import { Background } from "../ui/Background";
import { WaxSeal } from "../ui/WaxSeal";
import { PhoneView } from "./Demo";
import { BEATS, ESTIMATED_SECONDS, STEPS as DEMO_STEPS, STORY_MS, VOICE_AT, VOICE_LINES, ZOOM_MS, ZOOM_OUT_MS, beatMs, cuesBetween, phaseAt, sentenceStarts, sentences } from "./introScript";
import { duckMusic, pauseMusic, playSfx, setIntroMuted, startIntroSound, stopIntroSound } from "./sfx";
import { Story } from "./stories";
import { allVoice, hasVoice, stopVoice, voiceAudio } from "./voice";

/** The calm question a first-time visitor sees over the page. */
export function IntroPrompt({ onYes, onSkip }: { onYes: () => void; onSkip: () => void }) {
  return (
    <div className="intro-scrim">
      <m.div className="intro-prompt glass" role="dialog" aria-labelledby="intro-q" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.5 }}>
        <h2 id="intro-q">Want to see what Tabella is about?</h2>
        <p>A short film with a voiceover, about a minute.</p>
        <div className="intro-prompt-actions">
          <button type="button" className="btn primary" onClick={onYes}>
            <span>Yes, show me</span>
          </button>
          <button type="button" className="btn glass" onClick={onSkip}>
            <span>Skip</span>
          </button>
        </div>
      </m.div>
    </div>
  );
}

/** The cinematic opener: ink, a soft light rising, the words, the seal settling, the name. About five seconds. */
function Opener({ t, calm }: { t: number; calm: boolean }) {
  const words = calm || t >= 900, seal = calm || t >= 3000, name = calm || t >= 4100;
  return (
    <div className="opener">
      <m.div className="opener-light" aria-hidden="true" initial={false} animate={{ opacity: calm || t >= 300 ? 1 : 0, y: calm || t >= 300 ? "0%" : "28%" }} transition={{ duration: calm ? 0.01 : 3.4, ease: EASE }} />
      <div className="opener-words">{words && <Headline text="Some things should be said *one day*." as="h2" className="opener-h" />}</div>
      <div className="opener-seal">
        {seal && (
          <m.div className="seal-wrap" initial={{ opacity: 0, scale: 1.45, y: -16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.3, ease: EASE }}>
            <WaxSeal />
          </m.div>
        )}
      </div>
      <m.p className="opener-name" initial={false} animate={{ opacity: name ? 1 : 0, y: name ? 0 : 10 }} transition={{ duration: 1, ease: EASE }}>
        Tabella
      </m.p>
    </div>
  );
}

/** The caption follows the voice, a sentence at a time. */
function Caption({ line, sinceVoice, seconds, still }: { line: number; sinceVoice: number; seconds: number; still: boolean }) {
  const text = VOICE_LINES[line]!;
  const parts = sentences(text);
  const starts = sentenceStarts(text, seconds);
  let idx = -1;
  starts.forEach((s, i) => {
    if (sinceVoice >= s) idx = i;
  });
  if (still) idx = parts.length - 1;
  return (
    <div className="intro-caption" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {idx >= 0 && (
          <m.p key={`${line}-${idx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            {still ? text : parts[idx]}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function useFit() {
  const [k, setK] = useState(1);
  useEffect(() => {
    const f = () => setK(Math.max(0.6, Math.min(1.4, (window.innerHeight - 250) / 600, (window.innerWidth - 24) / 292)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return k;
}

/**
 * Full-screen intro. The film is a list of beats (see introScript): the opener, then for each demo screen a short
 * illustrated scene, a smooth zoom into the phone, and the screen itself, with the voiceover, soft sound effects and a
 * calm music bed that ducks under the voice. One clock (beat, ms into the beat) drives everything.
 * Under reduced motion it is a still version: each beat as its finished picture and screen, with captions, stepped by hand.
 */
export function IntroPlayer({ onClose }: { onClose: () => void }) {
  const calm = !!useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [calmSub, setCalmSub] = useState<"story" | "phone">("story"); // still version: each beat is two stills, the picture then the screen
  const [secs, setSecs] = useState<Record<number, number>>({});
  const voiceStarted = useRef(-1);
  const prevT = useRef(-1);
  const k = useFit();
  const running = !paused && !hidden && !ended && !calm;
  const b = BEATS[beat]!;
  const lineSecs = b.line === null ? undefined : secs[b.line];
  const length = beatMs(beat, lineSecs);

  // real lengths of the recordings, as soon as they are known
  useEffect(() => {
    const offs: (() => void)[] = [];
    VOICE_LINES.forEach((_, line) => {
      const a = voiceAudio(line);
      if (!a) return;
      const f = () => isFinite(a.duration) && setSecs((s) => ({ ...s, [line]: a.duration }));
      if (a.readyState >= 1) f();
      a.addEventListener("loadedmetadata", f);
      offs.push(() => a.removeEventListener("loadedmetadata", f));
    });
    return () => offs.forEach((o) => o());
  }, []);

  // keep the page still behind, close on Escape, and let the sound end with the film
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const vis = () => setHidden(document.hidden);
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", vis);
      stopVoice();
      stopIntroSound();
    };
  }, [onClose]);

  // the clock
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => x + 100), 100);
    return () => clearInterval(id);
  }, [running]);

  const next = useCallback(() => {
    if (beat >= BEATS.length - 1) setEnded(true);
    else {
      setBeat((s) => s + 1);
      setT(0);
    }
  }, [beat]);
  useEffect(() => {
    if (running && t >= length) next();
  }, [t, length, running, next]);

  // sound effects fire at their moments in the beat
  useEffect(() => {
    if (!running) return;
    for (const c of cuesBetween(beat, prevT.current, t)) playSfx(c.sfx, c.gain);
    prevT.current = t;
  }, [t, beat, running]);
  useEffect(() => {
    prevT.current = -1;
  }, [beat]);

  // mute is one switch for the voice, the effects and the music
  useEffect(() => {
    setIntroMuted(muted);
    allVoice().forEach((a) => (a.muted = muted));
  }, [muted, beat]);
  // pause holds the music too
  useEffect(() => {
    pauseMusic(!running && !ended);
  }, [running, ended]);

  // the voice: starts early in its beat, stops when the beat ends, follows pause and mute
  useEffect(() => {
    if (calm) return;
    allVoice().forEach((a) => {
      if (b.line === null || a.dataset.voice !== String(b.line + 1)) {
        a.pause();
        a.currentTime = 0;
      }
    });
    voiceStarted.current = -1;
    duckMusic(false);
  }, [beat, b.line, calm]);
  useEffect(() => {
    if (calm || b.line === null) return;
    const a = voiceAudio(b.line);
    if (!a) return;
    if (!running) {
      a.pause();
      return;
    }
    if (t >= VOICE_AT[beat]! && voiceStarted.current !== beat) {
      voiceStarted.current = beat;
      a.currentTime = 0;
      a.muted = muted;
      void a.play().catch(() => {});
      duckMusic(true);
    } else if (voiceStarted.current === beat && a.paused && !a.ended) void a.play().catch(() => {});
    else if (a.ended) duckMusic(false);
  }, [t, running, beat, b.line, muted, calm]);
  useEffect(() => {
    if (ended) {
      stopVoice();
      stopIntroSound();
    }
  }, [ended]);

  const { phase, screenT } = calm ? { phase: calmSub, screenT: b.phoneMs - 100 } : phaseAt(beat, t, lineSecs);
  const step = b.step;
  const veilOn = step === 4 && screenT >= 7000 && screenT < 8400 && !calm;
  const progress = Math.min(1, t / length);
  const voiceSecs = lineSecs;

  // by-hand controls (also the arrows)
  const hear = () => {
    if (b.line === null) return;
    const a = voiceAudio(b.line);
    if (!a) return;
    stopVoice();
    a.muted = false;
    void a.play().catch(() => {});
  };
  const jump = (n: number) => {
    stopVoice();
    duckMusic(false);
    if (n < 0) return;
    if (n >= BEATS.length) {
      setEnded(true);
      return;
    }
    setEnded(false);
    setBeat(n);
    setT(0);
    if (n === 0) toneReset();
  };
  const toneReset = () => {};
  const replay = () => {
    stopVoice();
    setEnded(false);
    setPaused(false);
    setBeat(0);
    setT(0);
    startIntroSound(); // music from the top again
  };
  const goPrev = () => {
    if (calm && !ended && beat > 0 && calmSub === "phone") return setCalmSub("story");
    if (calm) setCalmSub("phone");
    jump(ended ? BEATS.length - 1 : beat - 1);
  };
  const goNext = () => {
    if (calm && !ended && beat > 0 && calmSub === "story") return setCalmSub("phone");
    setCalmSub("story");
    jump(beat + 1);
  };

  const inStory = phase === "story";
  const inPhone = phase !== "story";

  return (
    <m.div className="intro night" role="dialog" aria-modal="true" aria-label="Introduction to Tabella" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE }}>
      <Background />
      <header className="intro-bar">
        <div className="intro-segs" aria-hidden="true">
          {BEATS.map((_, i) => (
            <span key={i}>
              <m.i initial={false} animate={{ scaleX: ended || i < beat ? 1 : i === beat ? progress : 0 }} transition={{ duration: 0.12, ease: "linear" }} />
            </span>
          ))}
        </div>
        <div className="intro-buttons">
          <button type="button" className="icon-btn" onClick={replay} aria-label="Replay">
            <IconReplay size={20} />
          </button>
          {!calm && (
            <button type="button" className="icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"} disabled={ended}>
              {paused ? <IconPlay size={20} /> : <IconPause size={20} />}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setMuted((x) => !x)} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
            <IconSound on={!muted} size={20} />
          </button>
          <button type="button" className="icon-btn text" onClick={onClose} aria-label="Skip intro">
            Skip
          </button>
        </div>
      </header>

      <div className={`intro-stage ${paused ? "paused" : ""}`}>
        {ended ? (
          <m.div className="intro-end" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }}>
            <WaxSeal className="end-seal" />
            <h2>Ready when you are.</h2>
            <p>Sealed today. Opened when it matters.</p>
            <a className="btn primary big" href="/write">
              <span>Start here</span>
              <IconArrow size={20} />
            </a>
            <button type="button" className="btn glass" onClick={onClose}>
              <span>Back to the page</span>
            </button>
          </m.div>
        ) : beat === 0 ? (
          <Opener t={calm ? 99999 : t} calm={calm} />
        ) : (
          <div className="camera">
            {/* the illustrated scene: it fades in, then the camera pushes into the phone */}
            <m.div className="cam-story" initial={false} animate={{ opacity: inStory ? 1 : 0, scale: inStory ? 1 : 1.5 }} transition={{ duration: inStory ? 0.7 : ZOOM_MS / 1000, ease: EASE }} >
              <Story key={`${beat}-${calm}`} id={b.story!} still={calm} />
            </m.div>
            {/* the phone: it grows out of the scene, and shrinks away at the end */}
            <m.div className="cam-phone" initial={false} animate={{ opacity: inPhone ? (phase === "zoom-out" ? 0 : 1) : 0, scale: phase === "zoom-out" ? 0.78 : inPhone ? 1 : 0.5 }} transition={{ duration: phase === "zoom-out" ? ZOOM_OUT_MS / 1000 : ZOOM_MS / 1000, ease: EASE }}>
              <div className="intro-phone" style={{ height: 600 * k, width: 292 * k }}>
                <div className="intro-phone-in" style={{ transform: `scale(${k})` }}>
                  <PhoneView step={step!} t={screenT} shownT={screenT} still={!running} veilOn={veilOn} />
                </div>
              </div>
            </m.div>
          </div>
        )}
      </div>

      {!ended && (
        <>
          {beat === 0 ? (
            <p className="sr-only" aria-live="polite">
              {VOICE_LINES[0]}
            </p>
          ) : b.line !== null ? (
            <Caption line={b.line} sinceVoice={t - VOICE_AT[beat]!} seconds={voiceSecs ?? ESTIMATED_SECONDS[b.line]!} still={calm} />
          ) : (
            <div className="intro-caption" aria-hidden="true" />
          )}
          <p className="intro-step" aria-hidden="true">
            {beat === 0 || step === null ? "" : DEMO_STEPS[step]!.label}
          </p>
        </>
      )}

      {/* transparent glass arrows on the sides jump between scenes */}
      {!(beat === 0 && !ended) && (
        <button type="button" className="glass-arrow left" onClick={goPrev} aria-label="Previous scene">
          <IconChevL size={26} />
        </button>
      )}
      {!ended && (
        <button type="button" className="glass-arrow right" onClick={goNext} aria-label="Next scene">
          <IconChevR size={26} />
        </button>
      )}

      {calm && (
        <footer className="intro-still">
          <button type="button" className="btn glass" onClick={() => goPrev()} disabled={beat === 0 && !ended}>
            <IconBack size={18} />
            <span>Back</span>
          </button>
          {!ended && b.line !== null && hasVoice(b.line) && (
            <button type="button" className="btn glass" onClick={hear}>
              <IconPlay size={18} />
              <span>Hear this line</span>
            </button>
          )}
          {!ended && (
            <button type="button" className="btn primary" onClick={() => goNext()}>
              <span>Next</span>
              <IconArrow size={18} />
            </button>
          )}
        </footer>
      )}
    </m.div>
  );
}
