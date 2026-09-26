"use client";

import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { hostOf, pad2 } from "@/lib/format";
import { enterTransition, motionTokens } from "@/lib/motion";
import { requirementsFor, type LaunchRow } from "@/lib/data";
import { StatusField, StatusLabel, statusTextClass } from "./status-mark";

/**
 * One submission, as a band across the board.
 *
 * The row deliberately runs past the container's right edge on wide screens -
 * the board is a strip of tape, not a stack of cards.
 */
export function DirectoryRow({
  row,
  index,
  onOpen,
}: {
  row: LaunchRow;
  index: number;
  onOpen: (row: LaunchRow) => void;
}) {
  const { directory: dir, status } = row;
  const text = statusTextClass(status);
  const requirements = requirementsFor(dir);

  // Two reasons a row is held that the founder can personally undo. Marked on
  // the row itself because they are the only actionable difference between this
  // row and the twenty next to it - everything else needs a CAPTCHA solved,
  // which is not on offer.
  const gate =
    status === "needs_manual" && requirements.profileFields.length > 0
      ? "unlocks with your profile"
      : status === "needs_manual" && requirements.requiresConsent
        ? "needs your consent"
        : null;
  const action =
    status === "succeeded" && row.result_url
      ? { label: "View listing", href: row.result_url }
      : status === "needs_manual"
        ? { label: "Open form", href: dir.submission_url }
        : null;

  return (
    <motion.li
      layout="position"
      transition={{ duration: motionTokens.duration.shift, ease: motionTokens.easing.enter }}
      className="rule-b relative isolate"
    >
      <StatusField status={status} />

      <div className={cn("relative flex items-stretch gap-3 sm:gap-5", text, "state-transition")}>
        <button
          type="button"
          onClick={() => onOpen(row)}
          aria-label={`${dir.name} - ${row.detail}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-4 pl-3 text-left sm:gap-5 sm:pl-5"
        >
          <span className={cn("t-micro w-6 shrink-0 tabular", status === "succeeded" ? "opacity-55" : "opacity-45")}>
            {pad2(index + 1)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="t-head truncate text-[clamp(1rem,2.1vw,1.375rem)]">{dir.name}</span>
              <span className="t-micro opacity-55">{hostOf(dir.url)}</span>
              {gate && (
                <span className="t-micro border border-signal px-1 py-0.5 text-signal">{gate}</span>
              )}
              {dir.health === "broken" && (
                <span className="t-micro border border-current px-1 py-0.5 opacity-70">integration broken</span>
              )}
            </span>
            <span className="mt-1 block max-w-[62ch] truncate text-[0.8125rem] leading-snug opacity-75 sm:whitespace-normal">
              {row.detail}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-4 py-4 pr-3 sm:pr-5">
          <span className="hidden text-right sm:block">
            <StatusLabel status={status} attempt={row.attempt} />
          </span>

          {action ? (
            <a
              href={action.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "t-micro inline-flex h-9 cursor-pointer items-center gap-1.5 border px-3",
                "state-transition hover:-translate-y-px",
                status === "succeeded"
                  ? "border-paper/40 hover:border-paper hover:bg-paper hover:text-ink"
                  : "border-ink/35 hover:border-ink hover:bg-ink hover:text-paper",
              )}
            >
              {action.label}
              <ArrowUpRight className="size-3" />
            </a>
          ) : (
            // No action to offer. On mobile the status word takes this slot, so a
            // queued or blocked row is never left with an empty right edge.
            <span className="t-micro text-right sm:w-[92px]">
              <span className="sm:hidden">
                <StatusLabel status={status} />
              </span>
            </span>
          )}
        </div>
      </div>

      <span className="sr-only" role="status">
        {dir.name}: {row.detail}
      </span>
    </motion.li>
  );
}

/** Skeleton band. Same geometry as a real row, so nothing jumps when data lands. */
export function RowSkeleton({ index }: { index: number }) {
  return (
    <li className="rule-b relative">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...enterTransition, delay: Math.min(index * 0.03, 0.24) }}
        className="flex items-center gap-5 py-4 pl-5 pr-5"
      >
        <span className="t-micro w-6 opacity-30 tabular">{pad2(index + 1)}</span>
        <span className="flex-1 space-y-2">
          <span className="block h-4 w-40 bg-paper-sunk" />
          <span className="block h-3 w-64 max-w-full bg-paper-sunk/70" />
        </span>
        <span className="hidden h-3 w-20 bg-paper-sunk sm:block" />
      </motion.div>
    </li>
  );
}
