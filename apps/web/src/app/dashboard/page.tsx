import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { loadLatestLaunch } from "@/lib/launch/load";
import { createClient } from "@/lib/supabase/server";
import type { LaunchSnapshot } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "Launch board",
  description: "Live per-directory submission status for your app.",
};

// The board is a per-user read through RLS. Caching it would serve one
// founder's submissions to the next visitor.
export const dynamic = "force-dynamic";

/**
 * Server-render the board from Postgres, then let Realtime take over.
 *
 * `loadLatestLaunch` returns the exact `LaunchSnapshot` the client components
 * consume, so the first paint is real data - no skeleton, no client refetch of
 * something already in the HTML, and no entrance animation gating content.
 *
 * Falling back to `null` (and therefore to the fixture replay) is deliberate for
 * BOTH failure modes below. A signed-out visitor and a signed-in founder who has
 * not launched yet should both land on a board that demonstrates the product
 * rather than an empty page or a redirect. The demo is clearly the demo: it
 * carries a fixture app name, and every row is labelled with the same honest
 * reasons the real catalog records.
 */
export default async function DashboardPage() {
  let snapshot: LaunchSnapshot | null = null;

  try {
    const supabase = await createClient();
    snapshot = await loadLatestLaunch(supabase);
  } catch {
    // `requireUser` throws for an anonymous visitor, and a missing Supabase env
    // var throws at client construction. Neither is worth a 500 on a page whose
    // whole job is to show a board.
    snapshot = null;
  }

  return <DashboardView initialSnapshot={snapshot} />;
}
