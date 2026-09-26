"use client";

import { BoardError } from "@/components/dashboard/states";

/** Route-level error boundary. Says what happened and what to do about it. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="shell pt-16 pb-24">
      <BoardError
        message={error.message || "The board hit an unexpected error while rendering."}
        onRetry={reset}
      />
    </div>
  );
}
