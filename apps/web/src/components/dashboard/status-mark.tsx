"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { motionTokens, enterTransition } from "@/lib/motion";
import type { SubmissionStatus } from "@/lib/data";

/**
 * THE SIGNATURE ELEMENT.
 *
 * A submission is rendered as a press: an ink fill that grows across the row
 * from the left as work happens, and lands as a solid block when the listing is
 * printed. Hue is reserved for the machine - orange means "running". Terminal
 * outcomes are carried by the neutral ramp and by form:
 *
 *   queued        empty field, hairline only
 *   running       accent field at partial fill, scanline travelling across it
 *   succeeded     full ink block, the directory name knocked out in paper
 *   needs_manual  accent WASH with a solid accent edge - tagged and delivered
 *   failed        full sunk field with a burnt left edge, type struck back
 *
 * `needs_manual` used to be a full-bleed accent field. That was designed for a
 * board where it was the exception. It is the terminal state for 21 of 23
 * directories, and 21 solid orange bands read as 21 alarms - the exact
 * misreading this product cannot afford. So it is now a wash plus an edge: a
 * marked, finished item on a shelf. Quiet at scale, unmistakably not a failure,
 * and still the only other place the accent appears besides live work.
 *
 * Everything animates on transform and opacity. The fill is a `scaleX` on a
 * motion value, so a status that changes mid-flight retargets from wherever the
 * fill currently is - it never queues and never snaps.
 */

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  queued: "Queued",
  running: "Submitting",
  succeeded: "Receipt",
  failed: "Blocked",
  needs_manual: "Ready for you",
  pending_review: "Pending review",
  unconfirmed: "Unconfirmed",
  live: "Verified live",
};

/** How far the ink has travelled for a given status. */
const FILL: Record<SubmissionStatus, number> = {
  queued: 0,
  running: 0.58,
  succeeded: 1,
  failed: 1,
  needs_manual: 1,
  pending_review: 1,
  unconfirmed: 1,
  live: 1,
};

const FIELD: Record<SubmissionStatus, string> = {
  queued: "bg-transparent",
  running: "bg-signal",
  succeeded: "bg-ink",
  failed: "bg-paper-sunk",
  // 12% of the accent. Enough to group 21 rows into one legible band of
  // "delivered", nowhere near enough to shout.
  needs_manual: "bg-signal/12",
  pending_review: "bg-paper-sunk",
  unconfirmed: "bg-paper-sunk",
  live: "bg-ink",
};

/** Text colour that sits on top of the field once it has landed. */
export function statusTextClass(status: SubmissionStatus): string {
  switch (status) {
    case "succeeded":
    case "live":
      return "text-paper";
    case "running":
    case "needs_manual":
      return "text-ink";
    case "failed":
      return "text-ink-500";
    default:
      return "text-ink";
  }
}

export function StatusField({ status, className }: { status: SubmissionStatus; className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <motion.div
        className={cn("absolute inset-0 origin-left", FIELD[status])}
        initial={false}
        animate={{
          // Reduced motion: the field cross-fades in at full width instead of
          // travelling. The state still changes; it just stops moving.
          scaleX: reduce ? (FILL[status] > 0 ? 1 : 0) : FILL[status],
          opacity: reduce && status === "running" ? 0.55 : 1,
        }}
        transition={{
          duration: status === "running" ? motionTokens.duration.shift : motionTokens.duration.state,
          ease: motionTokens.easing.enter,
        }}
      />

      {status === "running" && (
        <div className="absolute inset-y-0 left-0 w-[58%] overflow-hidden">
          <div className="scanline absolute inset-y-0 -left-1/3 w-1/3 bg-ink/12" />
        </div>
      )}

      {/* The edge is the mark. Solid accent for a handoff, burnt for a block -
          same geometry, different meaning, both readable without colour because
          the status word and glyph carry it too. */}
      {status === "needs_manual" && <div className="absolute inset-y-0 left-0 w-[3px] bg-signal" />}
      {status === "failed" && <div className="absolute inset-y-0 left-0 w-[3px] bg-void" />}
    </div>
  );
}

/** The status word, plus the one-glyph state cue for anyone not reading colour. */
export function StatusLabel({
  status,
  attempt,
  className,
}: {
  status: SubmissionStatus;
  attempt?: number;
  className?: string;
}) {
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, y: motionTokens.distance.xs }}
      animate={{ opacity: 1, y: 0 }}
      transition={enterTransition}
      className={cn("t-meta inline-flex items-center gap-2 whitespace-nowrap", className)}
    >
      <StatusGlyph status={status} />
      <span className={cn(status === "failed" && "line-through decoration-void decoration-1")}>
        {STATUS_LABEL[status]}
      </span>
      {status === "queued" && attempt && attempt > 0 ? (
        <span className="text-ink-400">attempt {attempt + 1}</span>
      ) : null}
    </motion.span>
  );
}

function StatusGlyph({ status }: { status: SubmissionStatus }) {
  const base = "inline-block size-2 shrink-0";
  switch (status) {
    case "queued":
      return <span aria-hidden className={cn(base, "border border-current opacity-45")} />;
    case "running":
      return <span aria-hidden className={cn(base, "pulse-mark bg-current")} />;
    case "succeeded":
      return <span aria-hidden className={cn(base, "bg-current")} />;
    case "needs_manual":
      // A half-filled mark: the work is done on our side, not on yours.
      return (
        <span aria-hidden className={cn(base, "relative border border-current")}>
          <span className="absolute inset-y-0 left-0 w-1/2 bg-current" />
        </span>
      );
    case "failed":
      return <span aria-hidden className={cn(base, "bg-void")} />;
  }
}
