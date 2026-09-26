"use client";

import { useReducedMotion } from "motion/react";
import { motionTokens, enterTransition, exitTransition } from "@/lib/motion";

/**
 * Enter/exit variants that collapse to a cross-fade when the user has asked for
 * reduced motion. States still change - they just stop travelling.
 */
export function useSafeMotion(travel: number = motionTokens.distance.sm) {
  const reduce = useReducedMotion();
  const y = reduce ? 0 : travel;
  return {
    reduce: Boolean(reduce),
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0, transition: enterTransition },
    exit: { opacity: 0, y: reduce ? 0 : -travel, transition: exitTransition },
  };
}
