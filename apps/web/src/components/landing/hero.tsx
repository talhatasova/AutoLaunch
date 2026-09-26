"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_DIRECTORIES } from "@/lib/data";
import type { SubmissionStatus } from "@/lib/data";
import { enterTransition, motionTokens, revealTransition } from "@/lib/motion";
import { Counter, MaskedLines, Rise } from "@/components/motion/primitives";
import { StatusField, StatusLabel, statusTextClass } from "@/components/dashboard/status-mark";
import { LaunchComposer } from "@/components/launch/launch-composer";
import { cn } from "@/lib/cn";

const urlSchema = z
  .string()
  .trim()
  .min(1, "Enter the URL of the app you want listed.")
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.string().url("That does not look like a URL. Try something like yourapp.com."));

/**
 * The hero is the product, not a picture of the product: the headline states
 * the difference, and the strip beside it runs the actual submission states so
 * the claim is demonstrated before it is explained.
 *
 * There is no label above the headline. A small-caps line that only restates
 * what the H1 says beneath it is the single most reliable tell of a generated
 * page - it adds a beat of reading and no information. Where this page needs a
 * label it uses one that carries a real value (a count, a tier, a hostname).
 */
export function Hero() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * The URL, once it has parsed. Non-null means pre-flight is open.
   *
   * The URL step never submits anything. Everything that leaves this page
   * leaves from `LaunchComposer`, after the founder has seen whose name it goes
   * out under and decided each directory's consent for themselves.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  const tier3 = ALL_DIRECTORIES.filter((d) => d.tier === 3).length;
  const automated = ALL_DIRECTORIES.length - tier3;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = urlSchema.safeParse(value);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Enter a valid URL.";
      setError(message);
      toast.error("We need a working URL", { description: message });
      return;
    }
    setError(null);
    setConfirming(parsed.data);
  }

  return (
    <section className="shell" id="start">
      <div className="grid gap-x-10 gap-y-14 pt-16 pb-24 lg:grid-cols-12 lg:pt-24">
        <div className="lg:col-span-7">
          {/* Each line is wiped up from behind a hard edge, 90ms apart. The
              headline is in the DOM and readable before any of this runs. */}
          <MaskedLines
            as="h1"
            className="t-display fg-heading text-[clamp(3rem,7.5vw,7rem)]"
            stagger={motionTokens.stagger.loose}
            lines={[
              <>We don&rsquo;t list</>,
              <>directories.</>,
              <span key="accent" className="fg-accent">
                We submit
              </span>,
              <>to them.</>,
            ]}
          />

          <Rise
            as="p"
            delay={0.28}
            className="fg-body mt-9 max-w-[54ch] text-[1.0625rem] leading-relaxed"
          >
            Every other tool hands you a spreadsheet of links and wishes you luck. Paste your app
            URL and we do the work on all {ALL_DIRECTORIES.length}: {automated} go out end to end,
            and the {tier3} that put a CAPTCHA, a login wall or a human reviewer in the way come
            back fully assembled — every field filled, the form open, one click each. We stop at
            the challenge on purpose, and we tell you exactly where we stopped.
          </Rise>

          <Rise delay={0.36}>
            <form onSubmit={onSubmit} className="mt-10 max-w-xl" noValidate>
              <label htmlFor="app-url" className="t-micro fg-muted block">
                Your app URL
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  id="app-url"
                  name="url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="pagecrest.io"
                  value={value}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "app-url-error" : "app-url-hint"}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                />
                <Button type="submit" variant="signal" size="lg" className="shrink-0">
                  {confirming ? "Update URL" : "Start submitting"}
                </Button>
              </div>

              {error ? (
                <motion.p
                  id="app-url-error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={enterTransition}
                  className="t-micro fg-danger mt-3"
                >
                  {error}
                </motion.p>
              ) : (
                <p id="app-url-hint" className="t-micro fg-faint mt-3">
                  We read your title, description and logo from the page. You confirm everything
                  before anything is sent.
                </p>
              )}
            </form>
          </Rise>

          <AnimatePresence initial={false}>
            {confirming && (
              <LaunchComposer
                key={confirming}
                url={confirming}
                onCancel={() => setConfirming(null)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Offset down against the headline - the strip sits off the baseline grid. */}
        <div className="lg:col-span-5 lg:mt-20">
          <LiveStrip automated={automated} manual={tier3} />
        </div>
      </div>
    </section>
  );
}

/** Six directories running the real state machine, on a loop. */
const STRIP = [
  { name: "The Startup Project", tier: 2 as const, order: ["queued", "running", "succeeded"] },
  { name: "Startup Collections", tier: 2 as const, order: ["queued", "running", "succeeded"] },
  { name: "Product Hunt", tier: 3 as const, order: ["queued", "needs_manual", "needs_manual"] },
  { name: "AlternativeTo", tier: 3 as const, order: ["queued", "needs_manual", "needs_manual"] },
  { name: "Uneed", tier: 3 as const, order: ["queued", "needs_manual", "needs_manual"] },
  { name: "SoftwareSuggest", tier: 3 as const, order: ["queued", "needs_manual", "needs_manual"] },
] satisfies Array<{ name: string; tier: 2 | 3; order: SubmissionStatus[] }>;

function LiveStrip({ automated, manual }: { automated: number; manual: number }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Loops: the last row settles on beat 7, then a short hold before it restarts.
    const id = setInterval(() => setStep((s) => (s + 1) % 10), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: motionTokens.distance.xl }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...revealTransition, delay: 0.2 }}
      className="edge-heavy-t edge-b"
    >
      <p className="t-micro fg-faint px-3 py-2">Live board — pagecrest.io</p>
      <ul className="edge-t" aria-hidden>
        {STRIP.map((d, i) => {
          // Each row starts one beat after the one above it, then holds.
          const local = Math.max(0, Math.min(step - i, d.order.length - 1));
          const status = (d.order[local] ?? "queued") as SubmissionStatus;
          return (
            <li key={d.name} className="edge-b relative isolate">
              <StatusField status={status} />
              <div
                className={cn(
                  "state-transition relative flex items-center justify-between gap-3 px-3 py-3",
                  statusTextClass(status),
                )}
              >
                <span className="t-head truncate text-[0.9375rem]">{d.name}</span>
                <StatusLabel status={status} className="shrink-0 text-[0.625rem]" />
              </div>
            </li>
          );
        })}
      </ul>
      {/* Both counters run once, when the strip is first seen, and both are
          real figures read from the seeded catalog rather than decoration. */}
      <div className="t-micro fg-faint flex items-center justify-between px-3 py-3">
        <span>
          <Counter to={automated} className="fg-accent" /> automated
        </span>
        <span>
          <Counter to={manual} className="fg-heading" /> need you
        </span>
      </div>
    </motion.div>
  );
}
