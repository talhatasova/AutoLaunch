import Link from "next/link";
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
  return (
    // Opaque, with no blur. A translucent bar is the one place a "floating
    // glass" register creeps back in, and the masthead sits ON the page.
    <header className="edge-b surface-page sticky top-0 z-30 transition-colors duration-500 ease-[var(--ease-soft)]">
      <div className="shell flex h-14 items-center justify-between gap-6">
        <Link href="/" className="t-meta fg-heading cursor-pointer hover:text-[var(--accent)]">
          Directory<span className="fg-accent">Launch</span>
        </Link>

        <nav className="flex items-center gap-5" aria-label="Main">
          <Link
            href="/#directories"
            className="t-micro fg-muted hidden cursor-pointer hover:text-[var(--text-heading)] sm:inline"
          >
            Directories
          </Link>
          <Link
            href="/dashboard"
            className="t-micro fg-muted cursor-pointer hover:text-[var(--text-heading)]"
          >
            Dashboard
          </Link>
          <Button asChild variant="signal" size="sm">
            <Link href="/#start">Start a launch</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
