/**
 * The footer inherits whatever theme the last section left on the body, so it
 * reads as the continuation of the closing block rather than as a light strip
 * bolted underneath it.
 */
export function SiteFooter() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000";

  return (
    <footer className="edge-t surface-page transition-colors duration-500 ease-[var(--ease-soft)]">
      <div className="shell grid gap-8 py-12 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="t-meta fg-heading">
            Directory<span className="fg-accent">Launch</span>
          </p>
          <p className="fg-muted mt-3 max-w-[52ch] text-[0.8125rem] leading-relaxed">
            Curated directory research and verified automatic submissions for SaaS founders.
            Every receipt, review, and live listing keeps its own status.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 sm:flex-col sm:items-end" aria-label="Footer">
          <a
            href={`${marketingUrl}/#how-it-works`}
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            How it works
          </a>
          <a
            href={`${appUrl}/dashboard`}
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            Dashboard
          </a>
        </nav>
      </div>
    </footer>
  );
}
