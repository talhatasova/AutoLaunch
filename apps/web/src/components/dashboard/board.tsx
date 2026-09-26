"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import {
  TIER_DESCRIPTION,
  TIER_EMPTY_NOTE,
  TIER_LABEL,
  type LaunchRow,
  type SubmissionStatus,
  type Tier,
} from "@/lib/data";
import { plural } from "@/lib/format";
import { enterTransition } from "@/lib/motion";
import { useSafeMotion } from "@/hooks/use-safe-motion";
import { DirectoryRow, RowSkeleton } from "./directory-row";

/**
 * THE BOARD, GROUPED BY WHO IS HOLDING THE WORK.
 *
 * It used to group by tier, which quietly assumed a healthy Tier 1/2
 * population. The real catalog is 0 / 2 / 21, so a tier-grouped board renders
 * as one short section and one enormous one, and reads as "mostly unfinished".
 *
 * It is not unfinished. A run that ends 2 published and 21 ready-for-you is the
 * product working exactly as designed: we refuse to solve challenges or forge
 * logins, so those 21 come back as assembled payloads instead. Grouping by
 * disposition puts both halves under the same banner - delivered - and leaves
 * "blocked" as the small, rare, genuinely-bad group it actually is.
 *
 * Tier still appears, as a legend and on each row's detail sheet, because it is
 * the evidence behind the grouping. It is no longer the primary axis.
 */

interface Group {
  key: string;
  /** The word that goes above the count. */
  label: string;
  /** One sentence of framing. Never an apology, never a nag. */
  note: string;
  match: (status: SubmissionStatus) => boolean;
  tone: "ink" | "signal" | "muted" | "void";
  /** Hidden entirely when empty - an empty group is not information. */
  hideWhenEmpty: boolean;
}

const GROUPS: Group[] = [
  {
    key: "in_flight",
    label: "In flight",
    note: "Workers are on these now. You can close the tab - the run continues server-side.",
    match: (s) => s === "queued" || s === "running",
    tone: "muted",
    hideWhenEmpty: true,
  },
  {
    key: "published",
    label: "Submitted end to end",
    note: "We filled the form and their own confirmation came back. Nothing further is needed from you.",
    match: (s) => s === "succeeded",
    tone: "ink",
    hideWhenEmpty: false,
  },
  {
    key: "ready",
    label: "Ready for you",
    note: "Every field filled, the payload assembled, the form ready to open. These sites want a human - a CAPTCHA, a login, a reviewer - so we stopped there rather than faking one. This is the normal result, and it is finished work.",
    match: (s) => s === "needs_manual",
    tone: "signal",
    hideWhenEmpty: false,
  },
  {
    key: "blocked",
    label: "Blocked",
    note: "The form changed underneath us and retrying cannot help. The log has the selector we could not find.",
    match: (s) => s === "failed",
    tone: "void",
    hideWhenEmpty: true,
  },
];

export function Board({ rows, onOpen }: { rows: LaunchRow[]; onOpen: (row: LaunchRow) => void }) {
  let offset = 0;

  return (
    <div>
      <TierLegend rows={rows} />

      {GROUPS.map((group) => {
        const members = rows.filter((row) => group.match(row.status));
        if (members.length === 0 && group.hideWhenEmpty) return null;

        const start = offset;
        offset += members.length;

        return (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="mb-14 last:mb-0">
            <header className="rule-t flex flex-wrap items-end gap-x-5 gap-y-2 border-t-2 border-t-ink pt-3 pb-4">
              {/* The count is set in the display face. With 21 rows in one
                  group the number IS the headline, so it gets the type. */}
              <motion.span
                key={members.length}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={enterTransition}
                className={cn(
                  "t-display-sm tabular text-[clamp(1.75rem,4vw,2.75rem)] leading-none",
                  group.tone === "signal" && "text-signal",
                  group.tone === "muted" && "text-ink-400",
                  group.tone === "void" && "text-void",
                )}
              >
                {members.length}
              </motion.span>

              <h2 id={`group-${group.key}`} className="t-meta pb-1 text-ink">
                {group.label}
              </h2>

              <p className="w-full max-w-[74ch] text-[0.8125rem] leading-snug text-ink-500">
                {members.length === 0 ? emptyNote(group.key) : group.note}
              </p>
            </header>

            {members.length === 0 ? null : (
              <ul className="rule-t">
                <AnimatePresence initial={false}>
                  {members.map((row, i) => (
                    <DirectoryRow key={row.id} row={row} index={start + i} onOpen={onOpen} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Copy for a group that has no rows.
 *
 * Only reachable for the two groups we always show. "Nothing published yet" is
 * a fact about this run; it is not phrased as a failure, because on a board
 * where 21 rows are already delivered it would not be one.
 */
function emptyNote(key: string): string {
  if (key === "published") {
    return "Nothing has come back from an automated submission yet. Two directories in the catalog accept one; the rest arrive below as prepared payloads.";
  }
  if (key === "ready") {
    return "Nothing waiting on you. Every directory in this run went through end to end.";
  }
  return "Nothing here.";
}

/**
 * The tier legend.
 *
 * Its whole job is honesty about the catalog. Tier 1 is EMPTY - not one of the
 * 23 directories publishes a create-listing API - so it is rendered as a named
 * absence with no count next to it. Showing "Tier 1 - 0" would read as a
 * loading state; showing a fabricated number would be a lie; hiding it would
 * let a reader assume the tier is quietly populated.
 */
function TierLegend({ rows }: { rows: LaunchRow[] }) {
  const safe = useSafeMotion();
  const tiers: Tier[] = [1, 2, 3];

  return (
    <motion.section
      aria-labelledby="tier-legend"
      initial={safe.initial}
      animate={safe.animate}
      className="mb-12"
    >
      <h2 id="tier-legend" className="gutter-label">
        How each one was graded
      </h2>

      <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-3">
        {tiers.map((tier) => {
          const count = rows.filter((row) => row.directory.tier === tier).length;
          const empty = count === 0;

          return (
            <div
              key={tier}
              className={cn("rule-t pt-2", empty ? "border-t-rule" : "border-t-2 border-t-ink")}
            >
              <dt className="flex items-baseline gap-2">
                <span className={cn("t-meta", empty ? "text-ink-300" : "text-ink")}>
                  Tier {tier} — {TIER_LABEL[tier]}
                </span>
                {empty ? (
                  <span className="t-micro text-ink-400">none yet</span>
                ) : (
                  <span className="t-micro tabular text-ink-400">
                    {count} {plural(count, "directory", "directories")}
                  </span>
                )}
              </dt>
              <dd
                className={cn(
                  "mt-1 max-w-[42ch] text-[0.8125rem] leading-snug",
                  empty ? "text-ink-400" : "text-ink-500",
                )}
              >
                {empty ? TIER_EMPTY_NOTE[tier] : TIER_DESCRIPTION[tier]}
              </dd>
            </div>
          );
        })}
      </dl>
    </motion.section>
  );
}

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <header className="rule-t flex items-baseline gap-4 border-t-2 border-t-ink pt-3 pb-4">
        <span className="t-meta text-ink-400">Reading the board</span>
      </header>
      <ul className="rule-t">
        {Array.from({ length: 8 }).map((_, i) => (
          <RowSkeleton key={i} index={i} />
        ))}
      </ul>
      <p className="t-micro mt-4 text-ink-400">
        Reading submission state. Nothing has been sent to a directory yet.
      </p>
    </div>
  );
}
