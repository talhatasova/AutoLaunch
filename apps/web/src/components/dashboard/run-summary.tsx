"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { enterTransition, motionTokens } from "@/lib/motion";
import { plural } from "@/lib/format";
import type { LaunchTally } from "@/hooks/use-launch";

/**
 * THE VERDICT.
 *
 * The number that matters is not "how many got published" - with this catalog
 * that is 2, and leading with 2 out of 23 would describe a triumph as a
 * shortfall. The number that matters is how many directories are DONE WITH:
 * published plus handed back as a finished payload. That is 23, and 23 of 23 is
 * exactly what a complete run looks like.
 *
 * Both halves then get equal typographic weight underneath, because they are
 * equally finished work. "Ready for you" is not a footnote to "published"; on
 * this catalog it is the main output, and the type says so.
 */
export function RunSummary({
  tally,
  appName,
  appUrl,
  done,
}: {
  tally: LaunchTally;
  appName: string;
  appUrl: string;
  done: boolean;
}) {
  const delivered = tally.succeeded + tally.needsManual;
  const total = tally.total;
  const deliveredPct = total === 0 ? 0 : delivered / total;
  const publishedPct = total === 0 ? 0 : tally.succeeded / total;
  const inFlight = tally.queued + tally.running;

  return (
    <div>
      <p className="gutter-label">{done ? "Run complete" : "Run in progress"}</p>

      <h1 className="t-display mt-3 break-words text-[clamp(1.75rem,3.4vw,3rem)]">{appName}</h1>

      <a
        href={appUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="t-meta mt-2 inline-block cursor-pointer text-ink-500 underline-offset-4 hover:text-signal hover:underline"
      >
        {appUrl.replace(/^https?:\/\//, "")}
      </a>

      <div className="mt-8 flex items-end gap-3">
        <motion.span
          key={delivered}
          initial={{ opacity: 0, y: motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className="t-display tabular text-[clamp(3rem,6vw,5.5rem)]"
        >
          {delivered}
        </motion.span>
        <span className="t-display-sm tabular pb-2 text-[clamp(1.25rem,3vw,2rem)] text-ink-400">
          / {total}
        </span>
        <span className="t-micro pb-3 text-ink-400">accounted for</span>
      </div>

      <p className="mt-2 max-w-[36ch] text-[0.9375rem] leading-snug text-ink-500">
        {done
          ? `Nothing is outstanding. ${tally.succeeded} ${plural(
              tally.succeeded,
              "listing went",
              "listings went",
            )} out end to end, and ${tally.needsManual} came back assembled and ready to send.`
          : `${delivered} ${plural(delivered, "directory is", "directories are")} done with. ${inFlight} still in flight — close the tab if you like, the run keeps going.`}
      </p>

      {/* Composition, not progress. Two origin-left scaleX layers over one
          track: solid ink for what we published, an accent wash for what we
          handed back. Never an animated width. */}
      <div
        className="relative mt-6 h-[10px] w-full overflow-hidden bg-paper-sunk"
        role="img"
        aria-label={`${tally.succeeded} of ${total} published, ${tally.needsManual} ready for you, ${inFlight} in flight, ${tally.failed} blocked`}
      >
        <motion.div
          className="absolute inset-0 origin-left bg-signal/25"
          initial={false}
          animate={{ scaleX: deliveredPct }}
          transition={enterTransition}
        />
        <motion.div
          className="absolute inset-0 origin-left bg-ink"
          initial={false}
          animate={{ scaleX: publishedPct }}
          transition={enterTransition}
        />
        {tally.failed > 0 && (
          <div className="absolute inset-y-0 right-0 w-[3px] bg-void" aria-hidden />
        )}
      </div>

      {/* The two outputs, at the same size. This is the whole framing decision. */}
      <div className="mt-8 grid grid-cols-2 gap-x-6">
        <Output
          label="Submitted end to end"
          value={tally.succeeded}
          note="Their confirmation came back."
          tone="ink"
        />
        <Output
          label="Ready for you"
          value={tally.needsManual}
          note="Filled, assembled, one click each."
          tone="signal"
        />
      </div>

      {/* Everything genuinely unfinished, kept small because it usually is. */}
      <p className="t-micro rule-t mt-6 flex flex-wrap gap-x-5 gap-y-1 pt-3 text-ink-400">
        <span className="tabular">{inFlight} in flight</span>
        <span className={cn("tabular", tally.failed > 0 && "text-void")}>
          {tally.failed} blocked
        </span>
      </p>
    </div>
  );
}

function Output({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "ink" | "signal";
}) {
  return (
    <div className={cn("rule-t border-t-2 pt-2", tone === "signal" ? "border-t-signal" : "border-t-ink")}>
      <p
        className={cn(
          "t-display-sm tabular text-[clamp(1.75rem,4vw,2.5rem)] leading-none",
          tone === "signal" ? "text-signal" : "text-ink",
        )}
      >
        <motion.span
          key={value}
          initial={{ opacity: 0, y: motionTokens.distance.xs }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className="inline-block"
        >
          {value}
        </motion.span>
      </p>
      <p className="t-micro mt-2 text-ink">{label}</p>
      <p className="mt-1 max-w-[22ch] text-[0.75rem] leading-snug text-ink-400">{note}</p>
    </div>
  );
}
