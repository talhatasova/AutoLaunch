"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ALL_DIRECTORIES } from "@/lib/data";

/**
 * Empty and error states carry real content. An empty screen is an invitation
 * to act, and an error says what happened and what to do about it - neither
 * apologises, and neither is a shrug emoji on a centred card.
 */

export function BoardEmpty() {
  const tier3 = ALL_DIRECTORIES.filter((d) => d.tier === 3).length;
  const automated = ALL_DIRECTORIES.length - tier3;

  return (
    <div className="rule-t border-t-2 border-t-ink pt-8">
      <p className="gutter-label">No launch yet</p>
      <h2 className="t-display mt-3 max-w-[14ch] text-[clamp(2rem,6vw,4rem)]">
        The board is empty, not broken
      </h2>
      <p className="mt-4 max-w-[54ch] text-[0.9375rem] leading-relaxed text-ink-700">
        Paste your app URL and all {ALL_DIRECTORIES.length} directories appear here at once.{" "}
        {automated} are submitted end to end by a worker. The other {tier3} put a CAPTCHA, a login
        wall or a human reviewer in the way, so they come back assembled and ready for one click
        each — on the board, never hidden.
      </p>
      <p className="mt-3 max-w-[54ch] text-[0.8125rem] leading-relaxed text-ink-500">
        That split is the product working, not a limitation of it. We do not solve challenges and
        we do not create accounts in your name.
      </p>
      <Button asChild variant="signal" size="md" className="mt-6">
        <Link href="/#start">Start a launch</Link>
      </Button>
    </div>
  );
}

export function BoardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rule-t border-t-2 border-t-void pt-8" role="alert">
      <p className="gutter-label text-void">Board unavailable</p>
      <h2 className="t-display mt-3 max-w-[16ch] text-[clamp(1.75rem,5vw,3rem)]">
        We could not read your submission state
      </h2>
      <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-700">
        {message} Your submissions are unaffected — the workers run server-side and keep going
        whether or not this page is open.
      </p>
      <Button onClick={onRetry} variant="ink" size="md" className="mt-6">
        Reload the board
      </Button>
    </div>
  );
}
