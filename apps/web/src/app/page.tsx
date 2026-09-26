import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { DirectoryLedger, TheRun, Tiers } from "@/components/landing/sections";
import { MaskedLines, ThemeSection } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";

/**
 * The page alternates theme rather than running one surface top to bottom.
 *
 * light hero -> DARK run -> light tiers -> light ledger -> DARK close
 *
 * The inversion is doing structural work, not decoration: the two dark bands
 * are the two moments that belong to the machine (the run, and the ask), and
 * the light bands are the two that belong to the reader (what we refuse, and
 * the catalog). Each dark section also drives `document.body`, so the
 * overscroll gutter follows the section that owns the viewport.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <TheRun />
      <Tiers />
      <DirectoryLedger />

      <ThemeSection theme="dark" className="pb-24">
        <div className="shell">
          <div className="flex flex-col gap-8 py-16 lg:flex-row lg:items-end lg:justify-between">
            <MaskedLines
              as="h2"
              className="t-display fg-heading max-w-[14ch] text-[clamp(2.5rem,7vw,5.5rem)]"
              lines={[<>Stop reading</>, <>directory lists</>]}
            />
            <div className="lg:max-w-sm">
              <p className="fg-body text-[0.9375rem] leading-relaxed">
                One URL, one run, every listing accounted for. You will know exactly which links
                went live and exactly which ones still want thirty seconds of your time.
              </p>
              <Button asChild variant="signal" size="lg" className="mt-6">
                <Link href="/#start">Start a launch</Link>
              </Button>
            </div>
          </div>
        </div>
      </ThemeSection>
    </>
  );
}
