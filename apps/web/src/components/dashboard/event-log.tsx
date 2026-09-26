"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { clockTime } from "@/lib/format";
import { enterTransition, exitTransition, motionTokens } from "@/lib/motion";
import type { LaunchEvent } from "@/lib/data";
import { useSafeMotion } from "@/hooks/use-safe-motion";

/** Event kinds where the machine deliberately stopped. Worth marking in accent. */
const HELD = new Set(["challenge_detected", "manual_required", "selector_missing", "failed"]);

export function EventLog({ events }: { events: LaunchEvent[] }) {
  const safe = useSafeMotion(motionTokens.distance.sm);

  return (
    <section aria-labelledby="log-heading" className="flex h-full min-h-0 flex-col">
      <header className="rule-b flex items-baseline justify-between pb-2">
        <h2 id="log-heading" className="t-meta">
          Activity
        </h2>
        <span className="t-micro text-ink-400">live</span>
      </header>

      {events.length === 0 ? (
        <p className="t-data mt-4 text-ink-400">
          No activity yet. The first line appears the moment a worker picks up a job.
        </p>
      ) : (
        <ol className="no-scrollbar mt-1 flex-1 overflow-y-auto" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {events.map((e) => (
              <motion.li
                key={e.id}
                layout="position"
                initial={safe.initial}
                animate={safe.animate}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={enterTransition}
                className="rule-b flex gap-3 py-2.5"
              >
                <span className="t-micro tabular shrink-0 pt-0.5 text-ink-300">{clockTime(e.at)}</span>
                <span className="min-w-0">
                  <span className={cn("t-micro block", HELD.has(e.kind) ? "text-signal" : "text-ink-500")}>
                    {e.directory_name}
                  </span>
                  <span className="t-data mt-0.5 block text-ink-700">{e.message}</span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
