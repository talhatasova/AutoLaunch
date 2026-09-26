import Link from "next/link";
import { ALL_DIRECTORIES } from "@/lib/data";

/**
 * The footer inherits whatever theme the last section left on the body, so it
 * reads as the continuation of the closing block rather than as a light strip
 * bolted underneath it.
 */
export function SiteFooter() {
  const tier3 = ALL_DIRECTORIES.filter((d) => d.tier === 3).length;

  return (
    <footer className="edge-t surface-page transition-colors duration-500 ease-[var(--ease-soft)]">
      <div className="shell grid gap-8 py-12 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="t-meta fg-heading">
            Directory<span className="fg-accent">Launch</span>
          </p>
          <p className="fg-muted mt-3 max-w-[52ch] text-[0.8125rem] leading-relaxed">
            We submit listings; we do not solve CAPTCHAs, create accounts on your behalf, or
            invent an identity. {tier3} directories require a human, and we say so on the board
            instead of hiding them.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 sm:flex-col sm:items-end" aria-label="Footer">
          <Link
            href="/#directories"
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            Directory list
          </Link>
          <Link
            href="/#tiers"
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            How tiers work
          </Link>
          <Link
            href="/dashboard"
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            Dashboard
          </Link>
        </nav>
      </div>
    </footer>
  );
}
