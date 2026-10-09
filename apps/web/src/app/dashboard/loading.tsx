export default function DashboardLoading() {
  return (
    <main className="shell min-h-[70dvh] py-10 md:py-14" role="status" aria-label="Loading your workspace">
      <div className="h-8 w-48 rounded-[2px] surface-sunk" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-44 rounded-[2px] surface-sunk" />)}
      </div>
      <p className="fg-muted mt-6">Loading your products and submissions…</p>
    </main>
  );
}
