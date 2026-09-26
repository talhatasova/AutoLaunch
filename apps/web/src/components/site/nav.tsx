import { Button } from "@/components/ui/button";

/**
 * A rule, a wordmark, two links. The nav is a masthead - it sits on the page
 * rather than floating above it in a translucent bar.
 *
 * It carries no theme of its own. `surface-page` reads the role token from
 * `document.body`, which the section currently owning the viewport sets, so
 * the masthead inverts as the reader crosses into a dark band instead of
 * hanging there as a light strip over dark content.
 */
export function SiteNav() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000";
  return (
    // Opaque, with no blur. A translucent bar is the one place a "floating
    // glass" register creeps back in, and the masthead sits ON the page.
    <header className="edge-b surface-page sticky top-0 z-30 transition-colors duration-500 ease-[var(--ease-soft)]">
      <div className="shell flex h-14 items-center justify-between gap-6">
        <a href={marketingUrl} className="t-meta fg-heading cursor-pointer hover:text-[var(--accent)]">
          Directory<span className="fg-accent">Launch</span>
        </a>

        <nav className="flex items-center gap-5" aria-label="Main">
          <a
            href={`${marketingUrl}/#how-it-works`}
            className="t-micro fg-muted hidden cursor-pointer hover:text-[var(--text-heading)] sm:inline"
          >
            How it works
          </a>
          <a
            href={`${appUrl}/dashboard`}
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            Dashboard
          </a>
          <Button asChild variant="signal" size="sm">
            <a href={`${appUrl}/auth/sign-in`}>Open beta</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
