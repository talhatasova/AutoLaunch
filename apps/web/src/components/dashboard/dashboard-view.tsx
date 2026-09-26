"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLaunch } from "@/hooks/use-launch";
import { createLaunchSource, DEMO_LAUNCH_ID, type LaunchRow, type LaunchSnapshot } from "@/lib/data";
import { Board, BoardSkeleton } from "./board";
import { RunSummary } from "./run-summary";
import { EventLog } from "./event-log";
import { DetailDrawer } from "./detail-drawer";
import { Unlocks } from "./unlocks";
import { BoardEmpty, BoardError } from "./states";

/**
 * The board, wired to whichever source it was given.
 *
 * With `initialSnapshot` the page was server-rendered from Postgres and the
 * live source is Supabase Realtime: the first paint already has every row, and
 * `submission_events` pushes the rest. Without it - signed out, or no launch yet
 * - it falls back to the fixture replay, which is the same demo the landing
 * page runs. Neither path polls.
 */
export function DashboardView({ initialSnapshot }: { initialSnapshot?: LaunchSnapshot | null }) {
  const [selected, setSelected] = useState<LaunchRow | null>(null);

  // Identity, not a value: a new source per render would tear down the Realtime
  // channel on every state change and the board would never settle.
  const source = useMemo(() => createLaunchSource(initialSnapshot ?? undefined), [initialSnapshot]);
  const launchId = initialSnapshot?.launch.id ?? DEMO_LAUNCH_ID;

  // A row settling is the one moment worth interrupting for. Published gets a
  // link; needs_manual gets the action, because that is the founder's cue.
  const onSettle = useCallback((row: LaunchRow) => {
    if (row.status === "succeeded") {
      toast.success(`${row.directory.name} — submitted`, {
        description: row.result_url ? "Your listing is live." : row.detail,
        ...(row.result_url
          ? {
              action: {
                label: "View",
                onClick: () => window.open(row.result_url!, "_blank", "noopener"),
              },
            }
          : {}),
      });
    } else if (row.status === "needs_manual") {
      // Deliberately `toast`, not `toast.error`. This is delivered work.
      toast(`${row.directory.name} — ready for you`, {
        description: "Payload assembled. One click submits it.",
        action: {
          label: "Open",
          onClick: () => window.open(row.directory.submission_url, "_blank", "noopener"),
        },
      });
    } else if (row.status === "failed") {
      toast.error(`${row.directory.name} — blocked`, { description: row.detail });
    }
  }, []);

  const { phase, launch, events, error, tally, retry } = useLaunch(launchId, {
    source,
    initialSnapshot,
    onSettle,
  });

  return (
    <div className="shell pb-24">
      <div className="grid gap-x-12 gap-y-12 pt-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* Left rail. Sticky on desktop so the counter stays with the board. */}
        <aside className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-hidden">
          {launch ? (
            <RunSummary
              tally={tally}
              appName={launch.app.name}
              appUrl={launch.app.url}
              done={launch.status === "done"}
            />
          ) : (
            <div className="space-y-4">
              <p className="gutter-label">Launch</p>
              <div className="h-16 w-56 max-w-full bg-paper-sunk" />
              <div className="h-24 w-40 bg-paper-sunk/70" />
            </div>
          )}

          <div className="mt-10 hidden lg:block lg:h-[34vh]">
            <EventLog events={events} />
          </div>
        </aside>

        {/* The board runs past the container's right edge on wide screens. */}
        <main className="min-w-0 lg:-mr-8">
          {phase === "loading" && <BoardSkeleton />}
          {phase === "error" && <BoardError message={error ?? "The board failed to load."} onRetry={retry} />}
          {phase === "ready" && launch && launch.rows.length === 0 && <BoardEmpty />}
          {phase === "ready" && launch && launch.rows.length > 0 && (
            <>
              <Board rows={launch.rows} onOpen={setSelected} />
              <Unlocks rows={launch.rows} />
            </>
          )}
        </main>

        {/* On small screens the log lives after the board, not before it. */}
        <div className="lg:hidden">
          <EventLog events={events} />
        </div>
      </div>

      <DetailDrawer row={selected} app={launch?.app ?? null} onClose={() => setSelected(null)} />
    </div>
  );
}
