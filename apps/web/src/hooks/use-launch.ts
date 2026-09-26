"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { launchSource } from "@/lib/data";
import type {
  Launch,
  LaunchEvent,
  LaunchRow,
  LaunchSnapshot,
  LaunchSource,
  SubmissionStatus,
} from "@/lib/data";

type Phase = "loading" | "ready" | "error";

interface LaunchState {
  phase: Phase;
  launch: Launch | null;
  events: LaunchEvent[];
  error: string | null;
}

export interface LaunchTally {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  needsManual: number;
  failed: number;
  settled: number;
}

const EMPTY_TALLY: LaunchTally = {
  total: 0,
  queued: 0,
  running: 0,
  succeeded: 0,
  needsManual: 0,
  failed: 0,
  settled: 0,
};

function tally(rows: LaunchRow[]): LaunchTally {
  const counts: Record<SubmissionStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    needs_manual: 0,
    pending_review: 0,
    unconfirmed: 0,
    live: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return {
    total: rows.length,
    queued: counts.queued,
    running: counts.running,
    succeeded: counts.succeeded,
    needsManual: counts.needs_manual,
    failed: counts.failed,
    settled: counts.succeeded + counts.needs_manual + counts.failed,
  };
}

/** Fires whenever a row lands on a terminal status - used to raise toasts. */
export type SettleHandler = (row: LaunchRow) => void;

/**
 * The dashboard's only data entry point. It talks to `launchSource`, never to a
 * transport. Swapping fixtures for Supabase Realtime happens inside the source.
 */
export interface UseLaunchOptions {
  /** Defaults to the fixture replay used by the landing-page demo. */
  source?: LaunchSource;
  /**
   * State the server already rendered. When present the board is `ready` on the
   * very first client frame - no skeleton, no entrance animation gating content,
   * and no refetch of data that is already in the HTML.
   */
  initialSnapshot?: LaunchSnapshot | null;
  onSettle?: SettleHandler;
}

export function useLaunch(launchId: string, options: UseLaunchOptions = {}) {
  const { source = launchSource, initialSnapshot = null, onSettle } = options;

  const [state, setState] = useState<LaunchState>(() =>
    initialSnapshot
      ? {
          phase: "ready",
          launch: initialSnapshot.launch,
          events: [...initialSnapshot.events].reverse(),
          error: null,
        }
      : { phase: "loading", launch: null, events: [], error: null },
  );
  const [reloadKey, setReloadKey] = useState(0);

  const settleRef = useRef(onSettle);
  settleRef.current = onSettle;

  const retry = useCallback(() => {
    setState((s) => ({ ...s, phase: "loading", error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    source
      .getLaunch(launchId)
      .then((snapshot) => {
        if (!alive) return;
        setState({
          phase: "ready",
          launch: snapshot.launch,
          // The log is a live tail: newest first.
          events: [...snapshot.events].reverse(),
          error: null,
        });

        unsubscribe = source.subscribe(launchId, {
          onRow: (row) => {
            setState((s) => {
              if (!s.launch) return s;
              const previous = s.launch.rows.find((r) => r.id === row.id);
              const wasSettling =
                previous &&
                previous.status !== row.status &&
                (row.status === "succeeded" || row.status === "needs_manual" || row.status === "failed");
              if (wasSettling) settleRef.current?.(row);

              const rows = s.launch.rows.map((r) => (r.id === row.id ? row : r));
              const allDone = rows.every((r) => r.status !== "queued" && r.status !== "running");
              return {
                ...s,
                launch: { ...s.launch, status: allDone ? "done" : "launching", rows },
              };
            });
          },
          onEvent: (event) => {
            // Newest first, capped - the log is a live tail, not an archive.
            setState((s) => ({ ...s, events: [event, ...s.events].slice(0, 60) }));
          },
          onError: (error) => {
            setState((s) => ({ ...s, phase: "error", error: error.message }));
          },
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          phase: "error",
          launch: null,
          events: [],
          error: error instanceof Error ? error.message : "The launch could not be loaded.",
        });
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [launchId, reloadKey, source]);

  return {
    ...state,
    tally: state.launch ? tally(state.launch.rows) : EMPTY_TALLY,
    retry,
  };
}
