"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A consent control, not a generic checkbox.
 *
 * Built on a real `<input type="checkbox">` so it is keyboard-operable, works
 * with `required`, and is announced correctly - none of which a div with a
 * click handler gets for free. The box is 2px ink, square to 2px, and fills
 * with the accent when ticked; the tick itself is a transform, so it lands in
 * 180ms and can be interrupted mid-flight.
 *
 * There is no "check all" variant of this component on purpose. Consent in this
 * product is per-directory and is never inferred from another agreement.
 */
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** The agreement itself. Always names the directory it belongs to. */
  label: React.ReactNode;
  /** What happens if it stays unticked. Never phrased as a penalty. */
  hint?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const hintId = hint ? `${inputId}-hint` : undefined;

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-describedby={hintId}
          className="peer sr-only"
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "mt-[3px] grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-[2px]",
            "border-2 border-ink bg-transparent",
            "transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            "hover:bg-paper-sunk",
            "peer-checked:border-signal peer-checked:bg-signal peer-checked:hover:bg-signal",
            // The tick has to be addressed through the label: it is a
            // DESCENDANT of the sibling, and `peer-checked:` alone only reaches
            // the sibling itself.
            "peer-checked:[&>svg]:scale-100",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className={cn("mark-transition size-3 origin-center scale-0 text-ink")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="square"
          >
            <path d="M2 6.2 4.8 9 10 3.2" />
          </svg>
        </label>

        <div className="min-w-0">
          <label htmlFor={inputId} className="block cursor-pointer text-[0.875rem] leading-relaxed text-ink">
            {label}
          </label>
          {hint && (
            <p id={hintId} className="mt-1 max-w-[58ch] text-[0.8125rem] leading-relaxed text-ink-500">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";
