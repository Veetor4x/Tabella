/**
 * Every animation preset in one place, so the rule "animate only transform and opacity" can be checked by a test
 * (test/motion.test.ts walks everything exported here). Transform (x, y, scale, rotate) and opacity are the only
 * properties the browser can animate on the GPU without re-laying-out the page, which is what keeps this at 60 fps
 * on a phone. A calm version for people who prefer reduced motion comes from <MotionConfig reducedMotion="user">
 * (transforms are switched off, fades stay) plus the `useReducedMotion()` checks in the components.
 */
import type { TargetAndTransition, Transition, Variants } from "framer-motion";

// --- springs ---------------------------------------------------------------
export const spring: Transition = { type: "spring", stiffness: 420, damping: 28 };
export const springSoft: Transition = { type: "spring", stiffness: 240, damping: 26 };
export const springBouncy: Transition = { type: "spring", stiffness: 540, damping: 15 };
export const springPress: Transition = { type: "spring", stiffness: 650, damping: 17 };

// --- screens slide + fade; going forward and going back feel different -------------------
export const SLIDE = 56;
export const stepVariants: Variants = {
  // forward (dir 1): arrives from the right, slightly smaller, as if coming toward you
  // back (dir -1): arrives from the left, slightly larger, as if settling back
  enter: (dir: number) => ({ x: dir * SLIDE, opacity: 0, scale: dir > 0 ? 0.985 : 1.015 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { x: springSoft, scale: springSoft, opacity: { duration: 0.28 } } },
  exit: (dir: number) => ({
    x: dir * -SLIDE,
    opacity: 0,
    scale: dir > 0 ? 1.01 : 0.99,
    transition: { duration: 0.2, ease: "easeIn" },
  }),
};

// the heading, the lead and the content rise in one after another
export const riseContainer: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
export const rise: Variants = { hidden: { y: 12, opacity: 0 }, show: { y: 0, opacity: 1, transition: springSoft } };

// --- touch feel ----------------------------------------------------------------
/** Buttons squish when pressed and spring back when released. */
export const squish: TargetAndTransition = { scaleX: 1.04, scaleY: 0.9, transition: springPress };
export const buttonHover: TargetAndTransition = { y: -2, transition: spring };
/** Choice cards lift and tilt a little on hover or while a finger is down. */
export const cardHover: TargetAndTransition = { y: -4, rotate: -0.7, transition: spring };
export const cardTap: TargetAndTransition = { y: -1, scale: 0.98, rotate: 0.9, transition: springPress };
export const iconTap: TargetAndTransition = { scale: 0.86, rotate: -8, transition: springPress };

// --- things appearing ---------------------------------------------------------------
/** The "Ready ✓" badge pops in with a bounce. */
export const badgePop = {
  initial: { scale: 0, rotate: -14, opacity: 0 },
  animate: { scale: 1, rotate: 0, opacity: 1 },
  transition: springBouncy,
};
/** A person's card arrives, and leaves again if they are removed. */
export const cardEnter = {
  initial: { opacity: 0, y: 28, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.92, y: -8 },
  transition: springSoft,
};
export const emojiPop = {
  initial: { scale: 0.5, rotate: -24, opacity: 0 },
  animate: { scale: 1, rotate: 0, opacity: 1 },
  transition: springBouncy,
};
/** The glass plate behind the letter eases to its new size (see WriteStep). */
export const plateGrow = { scaleY: [0.93, 1.012, 1] } satisfies TargetAndTransition;
export const plateGrowTransition: Transition = { duration: 0.42, ease: "easeOut", times: [0, 0.55, 1] };

// --- the little stack of people (WhoStep) ---------------------------------------------
export const stackRest = (rotate: number) => ({ x: 0, y: 0, scale: 1, rotate, opacity: 1 });
export const stackFly = (dx: number, dy: number): TargetAndTransition => ({ x: dx, y: dy, scale: 1.7, rotate: 24, opacity: 1 });
export const stackFlyTransition: Transition = { type: "spring", stiffness: 190, damping: 17, mass: 0.9 };

// --- the progress dots -------------------------------------------------------------
export const pillMove = (step: number): TargetAndTransition => ({ x: `${step * 100}%`, scaleX: [1, 1.9, 1] });
export const pillTransition: Transition = {
  x: { type: "spring", stiffness: 250, damping: 23 },
  scaleX: { duration: 0.5, times: [0, 0.4, 1], ease: "easeInOut" },
};

// --- the hourglass ------------------------------------------------------------------
export const sandLevel = (level: number) => ({ scaleY: Math.max(0.001, level) });
export const sandTransition: Transition = { type: "spring", stiffness: 70, damping: 16 };
export const hourglassWobble = { rotate: [0, -7, 5, -2, 0] } satisfies TargetAndTransition;
export const grain = (i: number) => ({
  animate: { y: [0, 38], opacity: [0, 0.9, 0] },
  transition: { duration: 0.9, repeat: Infinity, delay: i * 0.3, ease: "linear" } as Transition,
});

// --- the sealing ceremony ----------------------------------------------------------
export const sheetIn: TargetAndTransition = { opacity: 1, y: 0 };
export const foldBottom: TargetAndTransition = { rotateX: 180 };
export const foldTop: TargetAndTransition = { rotateX: -180 };
export const foldTransition: Transition = { duration: 0.42, ease: "easeInOut" };
export const sheetIntoEnvelope: TargetAndTransition = { y: 138, scale: 0.84 };
export const sheetIntoTransition: Transition = { duration: 0.55, ease: [0.4, 0, 0.2, 1] };
export const flapClose: TargetAndTransition = { rotateX: 0 };
export const flapTransition: Transition = { duration: 0.45, ease: "easeInOut" };
export const envelopeBob = { y: [0, -5, 0] } satisfies TargetAndTransition;
/** The wax drop falls, stretching a little, and splats on landing. */
export const dropFall = { initial: { y: -190, opacity: 0, scaleY: 1.25 }, animate: { y: 0, opacity: 1, scaleY: 1 }, transition: { duration: 0.52, ease: [0.55, 0, 1, 0.45] } as Transition };
export const splat = { initial: { scaleX: 0, scaleY: 0, opacity: 0.95 }, animate: { scaleX: 1, scaleY: 0.7, opacity: 1 }, transition: { type: "spring", stiffness: 380, damping: 16 } as Transition };
/** The seal comes down and presses into the wax. */
export const stampDown = {
  initial: { scale: 2.1, y: -26, rotate: -16, opacity: 0 },
  animate: { scale: 1, y: 0, rotate: 0, opacity: 1 },
  transition: { type: "spring", stiffness: 520, damping: 19 } as Transition,
};
export const ripple = {
  initial: { scale: 0.25, opacity: 0.6 },
  animate: { scale: 2.8, opacity: 0 },
  transition: { duration: 0.85, ease: "easeOut" } as Transition,
};
/** A small screen shake when the seal lands. */
export const shake = { x: [0, -7, 6, -4, 3, 0], y: [0, 4, -3, 2, -1, 0] } satisfies TargetAndTransition;
export const shakeTransition: Transition = { duration: 0.36, ease: "easeOut" };
export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.35 } as Transition,
};

// --- sparkles on the success screen ----------------------------------------------------
export const sparkle = (i: number) => ({
  animate: { y: [0, -70 - (i % 4) * 14], opacity: [0, 0.9, 0], scale: [0.5, 1, 0.55], rotate: [0, i % 2 ? 40 : -40] },
  transition: { duration: 5.5 + (i % 5) * 0.9, repeat: Infinity, delay: (i * 0.55) % 4, ease: "easeInOut" } as Transition,
});

// --- the sound toggle --------------------------------------------------------------
export const togglePop: TargetAndTransition = { scale: [1, 1.18, 1] };
