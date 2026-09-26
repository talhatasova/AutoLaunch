import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A field that reads as part of the page's typographic system rather than a
 * floating card: no shadow, no radius softening, a heavy baseline rule that
 * thickens on focus.
 */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-transparent px-0 py-3 text-lg text-ink placeholder:text-ink-300",
        "border-0 border-b-2 border-ink/25 outline-none",
        "transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-ink/50 focus:border-signal focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
