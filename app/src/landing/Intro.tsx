import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { playSealTone } from "../lib/sound";
import { Headline } from "../ui/Headline";
import { IconArrow, IconBack, IconClose, IconPause, IconPlay, IconSound } from "../ui/icons";
import { EASE } from "../ui/motion";
import { Background } from "../ui/Background";
import { WaxSeal } from "../ui/WaxSeal";
import { PhoneView, STEPS } from "./Demo";
import { ESTIMATED_SECONDS, SCENES, VOICE_AT, VOICE_LINES, sceneMs, sentenceStarts, sentences, stepAt } from "./introScript";
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
 * Full-screen intro: the opener, then the demo's own screens, with the voiceover and matching captions.
 * One clock (scene, ms into the scene) drives the screens, the captions and the voice. Mute, pause and skip.
 * Under reduced motion it is a still version: each scene at its finished moment, with captions, stepped by hand.
 */
export function IntroPlayer({ onClose }: { onClose: () => void }) {
  const calm = !!useReducedMotion();
  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [secs, setSecs] = useState<Record<number, number>>({});
  const toneDone = useRef(false);
  const voiceStarted = useRef(-1);
  const k = useFit();
  const running = !paused && !hidden && !ended && !calm;
  const sc = SCENES[scene]!;
  const lineSecs = secs[sc.line];
  const length = sceneMs(scene, lineSecs);

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

  // keep the page still behind, and close on Escape
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
    };
  }, [onClose]);

  // the clock
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => x + 100), 100);
    return () => clearInterval(id);
  }, [running]);

  const next = useCallback(() => {
    if (scene >= SCENES.length - 1) setEnded(true);
    else {
      setScene((s) => s + 1);
      setT(0);
    }
  }, [scene]);
  useEffect(() => {
    if (running && t >= length) next();
  }, [t, length, running, next]);

  // the voice: starts when its moment in the scene comes, stops when the scene ends, follows pause and mute
  useEffect(() => {
    allVoice().forEach((a) => (a.muted = muted));
  }, [muted, scene]);
  useEffect(() => {
    if (calm) return;
    allVoice().forEach((a) => {
      if (a.dataset.voice !== String(sc.line + 1)) {
        a.pause();
        a.currentTime = 0;
      }
    });
    voiceStarted.current = -1;
  }, [scene, sc.line, calm]);
  useEffect(() => {
    const a = voiceAudio(sc.line);
    if (calm || !a) return;
    if (!running) {
      a.pause();
      return;
    }
    if (t >= VOICE_AT[scene]! && voiceStarted.current !== scene) {
      voiceStarted.current = scene;
      a.currentTime = 0;
      a.muted = muted;
      void a.play().catch(() => {});
    } else if (voiceStarted.current === scene && a.paused && !a.ended) void a.play().catch(() => {}); // resume after a pause
  }, [t, running, scene, sc.line, muted, calm]);
  useEffect(() => {
    if (ended) stopVoice();
  }, [ended]);
  // the soft tone as the seal settles
  useEffect(() => {
    if (scene === 0 && t >= 3000 && !toneDone.current && !muted && !calm) {
      toneDone.current = true;
      playSealTone(true);
    }
  }, [scene, t, muted, calm]);

  const at = calm ? length - 100 : t;
  const view = stepAt(scene, at);
  const veilOn = !!view && view.step === 4 && view.t >= 7000 && view.t < 8400 && !calm;
  const progress = Math.min(1, t / length);
  const voiceSecs = lineSecs ?? undefined;

  // by-hand controls (reduced motion)
  const hear = () => {
    const a = voiceAudio(sc.line);
    if (!a) return;
    stopVoice();
    a.muted = false;
    void a.play().catch(() => {});
  };
  const go = (d: number) => {
    stopVoice();
    if (ended) {
      setEnded(false);
      return;
    }
    const n = scene + d;
    if (n < 0) return;
    if (n >= SCENES.length) setEnded(true);
    else {
      setScene(n);
      setT(0);
    }
  };

  return (
    <m.div className="intro night" role="dialog" aria-modal="true" aria-label="Introduction to Tabella" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE }}>
      <Background />
      <header className="intro-bar">
        <div className="intro-segs" aria-hidden="true">
          {SCENES.map((_, i) => (
            <span key={i}>
              <m.i initial={false} animate={{ scaleX: ended || i < scene ? 1 : i === scene ? progress : 0 }} transition={{ duration: 0.12, ease: "linear" }} />
            </span>
          ))}
        </div>
        <div className="intro-buttons">
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

      <div className="intro-stage">
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
        ) : scene === 0 ? (
          <Opener t={calm ? 99999 : t} calm={calm} />
        ) : (
          <div className="intro-phone" style={{ height: 600 * k, width: 292 * k }}>
            <div className="intro-phone-in" style={{ transform: `scale(${k})` }}>
              <PhoneView step={view!.step} t={view!.t} shownT={view!.t} still={!running} veilOn={veilOn} />
            </div>
          </div>
        )}
      </div>

      {!ended && (
        <>
          {scene === 0 ? (
            <p className="sr-only" aria-live="polite">
              {VOICE_LINES[0]}
            </p>
          ) : (
            <Caption line={sc.line} sinceVoice={t - VOICE_AT[scene]!} seconds={voiceSecs ?? ESTIMATED_SECONDS[sc.line]!} still={calm} />
          )}
          <p className="intro-step" aria-hidden="true">
            {scene === 0 ? "" : STEPS[sc.steps[0]!]!.label}
          </p>
        </>
      )}

      {calm && (
        <footer className="intro-still">
          <button type="button" className="btn glass" onClick={() => go(-1)} disabled={scene === 0 && !ended}>
            <IconBack size={18} />
            <span>Back</span>
          </button>
          {!ended && hasVoice(sc.line) && (
            <button type="button" className="btn glass" onClick={hear}>
              <IconPlay size={18} />
              <span>Hear this line</span>
            </button>
          )}
          {!ended && (
            <button type="button" className="btn primary" onClick={() => go(1)}>
              <span>Next</span>
              <IconArrow size={18} />
            </button>
          )}
        </footer>
      )}
    </m.div>
  );
}
