import { AnimatePresence, m, useAnimationControls, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { playThud } from "../lib/sound";
import type { CeremonyState } from "./ceremony";
import {
  dropFall,
  envelopeBob,
  flapClose,
  flapTransition,
  foldBottom,
  foldTop,
  foldTransition,
  overlayFade,
  ripple,
  shake,
  shakeTransition,
  sheetIn,
  sheetIntoEnvelope,
  sheetIntoTransition,
  splat,
  springSoft,
  stampDown,
} from "./motion";
import { WaxSeal } from "./WaxSeal";

/**
 * Sealing, as a little ceremony: the letter folds in three and slides into an envelope, the flap closes,
 * a drop of wax falls, and the seal stamps down with a ripple, a small shake and (if switched on) a soft thud.
 * It plays while the letter is really being sealed; the stages after the fold wait for the real result.
 */
export function SealCeremony({ stage, text, slow }: CeremonyState) {
  const calm = useReducedMotion();
  const sheet = useAnimationControls();
  const top = useAnimationControls();
  const bottom = useAnimationControls();
  const flap = useAnimationControls();
  const scene = useAnimationControls();
  const [idle, setIdle] = useState(false);
  const flapRotate = useMotionValue(180);
  // an open flap sits behind the letter; once it starts closing it comes in front
  const flapZ = useTransform(flapRotate, (v) => (v > 90 ? 1 : 5));

  // 1. fold and fill the envelope (starts at once, while the letter is really being sealed)
  useEffect(() => {
    if (calm) {
      flapRotate.set(0);
      setIdle(true);
      return;
    }
    let alive = true;
    (async () => {
      await sheet.start({ ...sheetIn, transition: springSoft });
      if (!alive) return;
      await bottom.start({ ...foldBottom, transition: foldTransition });
      if (!alive) return;
      await top.start({ ...foldTop, transition: foldTransition });
      if (!alive) return;
      await sheet.start({ ...sheetIntoEnvelope, transition: sheetIntoTransition });
      if (!alive) return;
      await flap.start({ ...flapClose, transition: flapTransition });
      if (alive) setIdle(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. when the seal lands: small shake, and the soft thud (only if switched on)
  useEffect(() => {
    if (stage !== "stamping") return;
    if (!calm) void scene.start({ ...shake, transition: shakeTransition });
    const t = setTimeout(playThud, calm ? 0 : 130);
    return () => clearTimeout(t);
  }, [stage, calm, scene]);

  const stamped = stage === "stamping";
  return (
    <m.div className="ceremony" role="status" aria-live="polite" {...overlayFade}>
      <m.div className="ceremony-inner" animate={scene}>
        <m.div className="scene" animate={idle && !stamped && !calm ? envelopeBob : undefined} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
          <div className="env-back" />
          <m.div className="sheet" initial={{ opacity: 0, y: -34 }} animate={sheet}>
            <m.div className="third top" style={{ originY: 1, transformPerspective: 700 }} animate={top} />
            <div className="third mid" />
            <m.div className="third bottom" style={{ originY: 0, transformPerspective: 700 }} animate={bottom} />
          </m.div>
          <div className="env-front" />
          <m.div className="env-flap" style={{ originY: 0, transformPerspective: 800, rotateX: flapRotate, zIndex: flapZ }} animate={flap} />

          <AnimatePresence>
            {stage === "dropping" && !calm && (
              <m.svg key="drop" className="drop" viewBox="0 0 26 34" aria-hidden="true" {...dropFall}>
                <path d="M13 1 C13 1 2 15 2 22 a11 11 0 0 0 22 0 C24 15 13 1 13 1 Z" fill="#8c1d28" />
                <ellipse cx="9" cy="22" rx="2.4" ry="4" fill="#d9707a" opacity="0.55" />
              </m.svg>
            )}
          </AnimatePresence>
          {stamped && !calm && <m.div className="splat" {...splat} />}
          {stamped && !calm && <m.div className="ripple" {...ripple} transition={{ ...ripple.transition, delay: 0.12 }} />}
          {stamped && (
            <m.div className="seal-final" {...stampDown} transition={calm ? { duration: 0.4 } : { ...stampDown.transition, delay: 0.1 }}>
              <WaxSeal />
            </m.div>
          )}
        </m.div>
        <p>{text}</p>
        {slow && <p className="small">The Postman was resting, so this first step can take up to a minute. Thank you for waiting.</p>}
      </m.div>
    </m.div>
  );
}
