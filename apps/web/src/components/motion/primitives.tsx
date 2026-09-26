"use client";

import * as React from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/cn";
import {
  lineVariants,
  motionTokens,
  revealTransition,
  revealViewport,
  riseVariants,
  staggerParent,
} from "@/lib/motion";

/* ============================================================================
   Reveal primitives.

   Every one of these obeys the same two rules: nothing here gates first paint
   (the content is in the DOM and readable before any animation runs), and
   everything degrades to a cross-fade under `prefers-reduced-motion` rather
   than to nothing. `MotionProvider` sets `reducedMotion="user"` globally, so
   transform values are dropped by Motion itself; the explicit checks below are
   for the cases Motion cannot see, like a mask that would clip static text.
   ========================================================================== */

/**
 * A headline whose lines are wiped up from behind a hard edge.
 *
 * `lines` is an array because the break points are a typographic decision, not
 * something to be inferred - the designer decides where "We don't list" ends
 * and "directories." begins, and the mask is per line.
 */
export function MaskedLines({
  lines,
  className,
  as: Tag = "h2",
  stagger = motionTokens.stagger.normal,
  delay = 0,
}: {
  lines: React.ReactNode[];
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "div";
  stagger?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[Tag];

  // Under reduced motion the mask itself is the problem: a line translated out
  // of an overflow-hidden box is invisible, and if we then refuse to animate
  // the transform away, the headline never appears at all. So drop the mask.
  if (reduce) {
    return (
      <MotionTag
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={revealViewport}
        transition={{ duration: motionTokens.duration.shift, delay }}
      >
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
    >
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          <motion.span className="block" variants={lineVariants}>
            {line}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/** A block that rises into place once, when it first enters the viewport. */
export function Rise({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "p";
}) {
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      className={className}
      variants={riseVariants as Variants}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      transition={{ ...revealTransition, delay }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Staggered children. The parent orchestrates; each child must carry
 * `variants={riseVariants}` (or be a `<StaggerItem>`).
 */
export function Stagger({
  children,
  className,
  stagger = motionTokens.stagger.normal,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: "div" | "ul" | "ol" | "dl";
}) {
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      className={className}
      variants={staggerParent(stagger) as Variants}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
    >
      {children}
    </MotionTag>
  );
}

export function StaggerItem({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const MotionTag = motion[Tag];
  return (
    <MotionTag className={className} variants={riseVariants as Variants}>
      {children}
    </MotionTag>
  );
}

/**
 * A number that runs up to its value the first time it is seen.
 *
 * The value is written to the DOM node directly rather than through state:
 * a counter that calls setState sixty times a second re-renders its whole
 * subtree for a purely visual effect. The real number is also rendered as the
 * element's initial text, so it is correct with JavaScript disabled and
 * correct for a screen reader that reads before the animation starts.
 */
export function Counter({
  to,
  className,
  duration = motionTokens.duration.count,
}: {
  to: number;
  className?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, revealViewport);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (!inView || reduce) return;
    const node = ref.current;
    if (!node) return;

    const controls = animate(0, to, {
      duration,
      ease: motionTokens.easing.sweep,
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    // Rule: every animation cleans itself up. An unmount mid-count must not
    // keep writing to a detached node.
    return () => {
      controls.stop();
      node.textContent = String(to);
    };
  }, [inView, reduce, to, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {to}
    </span>
  );
}

/**
 * An infinite horizontal ticker.
 *
 * The content is rendered twice and the track translates -50%, so the loop is
 * seamless without measuring anything. The duplicate is `aria-hidden` because
 * it is the same content twice and a screen reader should hear it once.
 *
 * Pauses on hover (CSS) and pauses when the tab is hidden (below) - an
 * animation running at 60fps in a background tab is pure battery cost.
 */
export function Marquee({
  children,
  className,
  seconds = 42,
}: {
  children: React.ReactNode;
  className?: string;
  seconds?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onVisibility = () => {
      const track = ref.current;
      if (!track) return;
      track.style.animationPlayState =
        document.visibilityState === "hidden" ? "paused" : "running";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className={cn("marquee-host overflow-hidden", className)}>
      <div
        ref={ref}
        className="marquee-track"
        style={{ ["--marquee-duration" as string]: `${seconds}s` }}
      >
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A section that owns a theme.
 *
 * Setting `data-theme="dark"` re-maps the ten role tokens for everything
 * inside, and syncs `document.body` so the overscroll gutter and the browser
 * chrome match rather than flashing the light page colour at the edges.
 */
export function ThemeSection({
  children,
  theme = "light",
  className,
  id,
  ...rest
}: {
  children: React.ReactNode;
  theme?: "light" | "dark";
  className?: string;
  id?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLElement>(null);
  // `amount: 0.5` means the body colour flips only once the section genuinely
  // owns the viewport, not the instant its top edge appears.
  const owns = useInView(ref, { amount: 0.5 });

  React.useEffect(() => {
    if (!owns) return;
    if (theme === "dark") {
      document.body.dataset.theme = "dark";
      return () => {
        delete document.body.dataset.theme;
      };
    }
    delete document.body.dataset.theme;
  }, [owns, theme]);

  return (
    <section
      ref={ref}
      id={id}
      data-theme={theme === "dark" ? "dark" : undefined}
      className={cn("surface-page fg-body", className)}
      {...rest}
    >
      {children}
    </section>
  );
}
