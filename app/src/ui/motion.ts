/**
 * Every animation here moves or fades (transform + opacity), nothing else: that is what stays smooth on a phone.
 * Lines "draw" by growing (scale), blur "sharpens" by cross-fading, text "slides up through a mask" with y.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const screenTransition = { duration: 0.55, ease: EASE };
export const fadeTransition = { duration: 0.5, ease: EASE };
export const drawTransition = { duration: 0.7, ease: EASE };
export const veilTransition = { duration: 1.2, ease: [0.4, 0, 0.2, 1] as const };

/** Screen to screen: slides up when going forward, down when going back. */
export const screenVariants = {
  enter: (dir: number) => ({ opacity: 0, y: dir >= 0 ? 36 : -36 }),
  center: { opacity: 1, y: 0 },
  exit: (dir: number) => ({ opacity: 0, y: dir >= 0 ? -26 : 26 }),
};

/** A headline word rising through its mask. */
export const headlineContainer = { hidden: {}, show: { transition: { staggerChildren: 0.075, delayChildren: 0.12 } } };
export const maskWord = {
  hidden: { y: "115%" },
  show: { y: "0%", transition: { duration: 0.8, ease: EASE } },
};

export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay } },
});

/** A finished step shrinking into its pill at the top. */
export const pillIn = {
  initial: { opacity: 0, y: 46, scale: 1.7 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: EASE } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.25 } },
};

/** The big step number: a column of digits, the right one slides into view. */
export const numeralRoll = (step: number) => ({ y: `${-step * 20}%` });
export const progressTo = (step: number, total: number) => ({ scaleX: (step + 1) / total });

/** Connector lines drawing themselves. */
export const drawDown = (delay = 0) => ({
  initial: { scaleY: 0 },
  animate: { scaleY: 1, transition: { ...drawTransition, delay } },
});
export const drawAcross = (delay = 0) => ({
  initial: { scaleX: 0 },
  animate: { scaleX: 1, transition: { ...drawTransition, delay } },
});
export const labelIn = (delay = 0) => ({
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay } },
});
export const nodeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE, delay } },
});

/** Blurred empty card sharpening into the person's card (a cross-fade of two layers). */
export const ghostLayer = (checking: boolean) => ({ opacity: checking ? 1 : 0 });
export const sharpLayer = (checking: boolean) => ({ opacity: checking ? 0 : 1 });
export const cardAppear = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10, transition: { duration: 0.25 } },
};

/** The seal settling in the middle of the night screen. */
export const sealSettle = {
  initial: { opacity: 0, scale: 1.5, y: -18 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 1.5, ease: EASE, delay: 0.5 } },
};
export const pointIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.4 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.9, ease: EASE, delay } },
});

export const reveal = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
};
export const pressTap = { scale: 0.97 };
