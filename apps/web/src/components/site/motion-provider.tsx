"use client";

import { MotionConfig } from "motion/react";

/**
 * One place that honours `prefers-reduced-motion`, for every animation on the
 * site rather than only the ones that remembered to ask.
 *
 * `reducedMotion="user"` makes Motion drop transform and layout animations for
 * a user who has asked for less movement, while still animating opacity - which
 * is exactly the contract: states keep changing, they cross-fade instead of
 * travelling. Without this, every `motion.span` that was not individually wired
 * to `useReducedMotion` would keep moving.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
