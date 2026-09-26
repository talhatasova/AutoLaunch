"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <main className="shell min-h-[70dvh] py-16">
    <h1 className="t-display-sm fg-heading">Could not load your workspace.</h1>
    <p className="fg-body mt-4">Please try again. If the problem continues, contact us.</p>
    <Button type="button" variant="signal" className="mt-8" onClick={reset}>Try again</Button>
  </main>;
}
