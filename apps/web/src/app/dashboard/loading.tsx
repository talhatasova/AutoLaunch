import { BoardSkeleton } from "@/components/dashboard/board";

/** Route-level loading. Same geometry as the real board, so nothing jumps. */
export default function DashboardLoading() {
  return (
    <div className="shell pb-24">
      <div className="grid gap-x-12 gap-y-12 pt-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <p className="gutter-label">Launch</p>
          <div className="h-16 w-56 max-w-full bg-paper-sunk" />
          <div className="h-24 w-40 bg-paper-sunk/70" />
        </aside>
        <main className="min-w-0 lg:-mr-8">
          <BoardSkeleton />
        </main>
      </div>
    </div>
  );
}
