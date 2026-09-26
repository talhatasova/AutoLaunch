import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * shadcn's API (asChild, cva variants), none of shadcn's look.
 *
 * The hover is a clip-path sweep: a fill wipes up from the bottom edge and the
 * label inverts as it passes. This is the one borrowed interaction from the
 * SSTR reference, and it is borrowed because it is genuinely better than a
 * background-colour fade - a wipe has direction, so the control answers the
 * pointer instead of merely acknowledging it. It also costs nothing: clip-path
 * is composited, so the whole effect runs off the main thread.
 *
 * Accent fields always carry INK text, never white: black on signal orange
 * clears 4.5:1, white does not.
 */
const buttonVariants = cva(
  [
    "sweep inline-flex items-center justify-center gap-2 rounded-[2px]",
    "font-mono text-xs font-medium uppercase tracking-[0.08em] whitespace-nowrap",
    "select-none cursor-pointer",
    // Colour is transitioned alongside the wipe so the label inverts *with* the
    // fill rather than snapping ahead of it.
    "transition-[color,border-color,transform,opacity] duration-[var(--duration-sweep)] ease-[var(--ease-sweep)]",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45 disabled:[&::before]:hidden",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        /** The primary. Accent field, wiped to ink. */
        signal:
          "surface-accent [--sweep-fill:var(--text-heading)] hover:text-[var(--surface-page)] focus-visible:text-[var(--surface-page)]",
        /** The inverse. Ink field, wiped to accent. */
        ink: "bg-[var(--text-heading)] text-[var(--surface-page)] [--sweep-fill:var(--accent)] hover:text-[var(--accent-on)] focus-visible:text-[var(--accent-on)]",
        /** Quiet, until you touch it. */
        outline:
          "border fg-heading edge-strong bg-transparent [--sweep-fill:var(--accent)] hover:text-[var(--accent-on)] hover:border-[var(--accent)] focus-visible:text-[var(--accent-on)]",
        ghost:
          "bg-transparent fg-muted [--sweep-fill:var(--surface-sunk)] hover:text-[var(--text-heading)]",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-5",
        lg: "h-14 px-7 text-sm",
      },
    },
    defaultVariants: { variant: "ink", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
