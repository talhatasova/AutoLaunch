import Link from "next/link";

/**
 * Where a failed sign-in lands.
 *
 * Each reason gets its own sentence. "Something went wrong" for a cancelled
 * sign-in is how a user ends up filing a support ticket about a button they
 * pressed on purpose.
 */
const REASONS: Record<string, string> = {
  cancelled: "You cancelled the Google sign-in. Nothing happened - you can try again whenever you like.",
  missing_code:
    "That sign-in link had already been used or had expired. Start again and it will work.",
  exchange_failed:
    "We could not complete the sign-in. This usually means the link was opened in a different browser from the one that started it.",
  provider_error: "Google could not complete the sign-in. Trying again usually resolves it.",
  start_failed: "We could not reach Google to start the sign-in. Please try again in a moment.",
};

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = (reason && REASONS[reason]) || REASONS.exchange_failed;

  return (
    <section className="shell py-20">
      <h1 className="t-display text-[clamp(1.75rem,5vw,3rem)]">Sign-in did not complete</h1>
      <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-500">{message}</p>
      <Link href="/" className="t-micro mt-8 inline-block cursor-pointer text-ink underline hover:text-signal">
        Back to the start
      </Link>
    </section>
  );
}
