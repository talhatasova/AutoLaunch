/** App masthead: wordmark to the dashboard, an optional link home to the marketing site. */
export function AppNav() {
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
  return (
    <header className="edge-b surface-page sticky top-0 z-30">
      <div className="shell flex h-14 items-center justify-between gap-6">
        <a href="/dashboard" className="t-meta fg-heading cursor-pointer hover:text-[var(--accent)]">
          Directory<span className="fg-accent">Launch</span>
        </a>
        {marketingUrl ? (
          <a href={marketingUrl} className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]">
            Home
          </a>
        ) : null}
      </div>
    </header>
  );
}
