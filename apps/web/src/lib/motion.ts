/**
 * Motion tokens.
 *
 * The contract, in numbers:
 *  - 150-250ms for UI state changes. Above 300ms feels broken.
 *  - ease-out on enter, ease-in on exit. Never linear, never the default ease.
 *  - transform and opacity only.
 *
 * Entrances are the one deliberate exception to the 250ms ceiling. A scroll
 * reveal is not a state change - nothing has happened that the user is waiting
 * on - so it is allowed the longer, flatter `sweep` curve. The ceiling exists
 * to stop a control feeling unresponsive, and a reveal is not a control.
 *
 * Components import from here. Inline durations and easings are not allowed.
 */
export const motionTokens = {
  duration: {
    /** Focus rings, badge swaps, tooltip show. */
    instant: 0.12,
    /** The default for a status change. */
    state: 0.18,
    /** A larger shift - a drawer, a row reordering. */
    shift: 0.24,
    /** A clip-path sweep across a control. */
    sweep: 0.375,
    /** A scroll reveal. Not a state change; see the note above. */
    reveal: 0.62,
    /** A counter running up to its value. */
    count: 1.1,
  },
  easing: {
    /** ease-out. Everything that enters. */
    enter: [0.16, 1, 0.3, 1] as const,
    /** ease-in. Everything that leaves. */
    exit: [0.7, 0, 0.84, 0] as const,
    /**
     * SSTR's curve. A steep head and a long flat tail, which is what makes a
     * wipe or a masked line read as one decisive gesture rather than a slide.
     */
    sweep: [0.675, 0.15, 0.1, 1] as const,
    /** Vaul's curve. For anything sheet-like or gesture-adjacent. */
    soft: [0.32, 0.72, 0, 1] as const,
  },
  distance: { xs: 4, sm: 8, md: 14, lg: 22, xl: 40 },
  scale: { press: 0.97, pop: 1.02, subtle: 0.985 },
  /** Stagger between siblings. Above 0.1s a list stops feeling like one object. */
  stagger: { tight: 0.045, normal: 0.07, loose: 0.09 },
} as const;

/** Springs for gesture- and physics-adjacent motion only. */
export const springs = {
  snappy: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
  gentle: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
  release: { type: "spring", stiffness: 220, damping: 24, restDelta: 0.001 },
} as const;

export const enterTransition = {
  duration: motionTokens.duration.state,
  ease: motionTokens.easing.enter,
} as const;

export const exitTransition = {
  duration: motionTokens.duration.instant,
  ease: motionTokens.easing.exit,
} as const;

export const revealTransition = {
  duration: motionTokens.duration.reveal,
  ease: motionTokens.easing.sweep,
} as const;

/**
 * The viewport trigger every scroll reveal shares.
 *
 * `once` is not negotiable: an element that re-animates every time it re-enters
 * turns scrolling back up into a light show. `amount: 0.25` fires when a
 * quarter of the element is showing, which for a tall section means it has
 * already started animating by the time the reader's eye arrives.
 */
export const revealViewport = { once: true, amount: 0.25 } as const;

/**
 * Masked-line variants. The child travels a full line-height, and the parent
 * carries `.line-mask` (overflow hidden), so the glyphs are wiped into view
 * from behind a hard edge instead of fading.
 *
 * Named rather than inlined so one parent can drive a whole headline through a
 * single `staggerChildren`.
 */
export const lineVariants = {
  hidden: { y: "110%" },
  visible: { y: "0%", transition: revealTransition },
} as const;

export const staggerParent = (stagger: number = motionTokens.stagger.normal) => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

/** A block that rises and fades in as one piece. */
export const riseVariants = {
  hidden: { opacity: 0, y: motionTokens.distance.lg },
  visible: { opacity: 1, y: 0, transition: revealTransition },
} as const;
