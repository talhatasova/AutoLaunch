import { cn } from "@/lib/cn";
import type { Tier } from "@/lib/data";

/** Tier is structural information, so it is set as data, not as a coloured pill. */
export function TierMark({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center border border-rule-strong px-1.5 font-mono text-[10px] font-medium tracking-[0.12em] text-ink-500 uppercase",
        tier === 3 && "border-dashed",
        className,
      )}
    >
      T{tier}
    </span>
  );
}
