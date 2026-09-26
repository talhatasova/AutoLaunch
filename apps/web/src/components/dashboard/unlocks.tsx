"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useSafeMotion } from "@/hooks/use-safe-motion";
import { plural } from "@/lib/format";
import { PROFILE_FIELD_LABEL, requirementsFor, type LaunchRow } from "@/lib/data";

/**
 * THE UPGRADE PATH.
 *
 * Some rows are `needs_manual` for a reason the founder can personally remove:
 * a directory wants company details we do not have, or wants its own terms
 * agreed to. Those are not errors and they are not nags. They are the only
 * lever on this page that moves a row from "ready for you" to "we did it", so
 * they get stated once, quietly, with the exact number they would unlock.
 *
 * Deliberately NOT rendered as a warning: no alert role, no void colour, no
 * exclamation. A founder who ignores this panel forever still has a complete
 * launch - twenty-one assembled payloads - and the panel must not imply
 * otherwise.
 */
export function Unlocks({ rows }: { rows: LaunchRow[] }) {
  const safe = useSafeMotion();

  const held = rows.filter((row) => row.status === "needs_manual");

  const profileHeld = held.filter((row) => requirementsFor(row.directory).profileFields.length > 0);
  const consentHeld = held.filter((row) => {
    const requirements = requirementsFor(row.directory);
    return requirements.requiresConsent && requirements.profileFields.length === 0;
  });

  if (profileHeld.length === 0 && consentHeld.length === 0) return null;

  const missingFields = Array.from(
    new Set(profileHeld.flatMap((row) => requirementsFor(row.directory).profileFields)),
  );

  return (
    <motion.section
      aria-labelledby="unlocks-heading"
      initial={safe.initial}
      animate={safe.animate}
      className="rule-t mt-14 border-t-2 border-t-signal pt-4"
    >
      <p className="gutter-label text-signal">Can be automated next time</p>
      <h2 id="unlocks-heading" className="t-display-sm mt-2 max-w-[20ch] text-[clamp(1.5rem,3.4vw,2.25rem)]">
        {profileHeld.length + consentHeld.length} of these are one answer away
      </h2>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {profileHeld.length > 0 && (
          <div className="rule-t pt-3">
            <h3 className="t-meta text-ink">
              Complete your profile to unlock {profileHeld.length}{" "}
              {plural(profileHeld.length, "directory", "directories")}
            </h3>

            <p className="mt-2 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink-700">
              {profileHeld.map((row) => row.directory.name).join(", ")}{" "}
              {plural(profileHeld.length, "asks", "ask")} for company details a product listing does
              not carry. We will not invent a headcount or a customer count for you — they would be
              published under your name.
            </p>

            <ul className="mt-4 flex flex-wrap gap-2">
              {missingFields.map((field) => (
                <li key={field} className="t-micro border border-rule-strong px-2 py-1 text-ink-500">
                  {PROFILE_FIELD_LABEL[field]}
                </li>
              ))}
            </ul>

            <Button asChild variant="signal" size="sm" className="mt-5">
              <Link href="/#company-profile">Add company details</Link>
            </Button>
          </div>
        )}

        {consentHeld.length > 0 && (
          <div className="rule-t pt-3">
            <h3 className="t-meta text-ink">
              {consentHeld.length} {plural(consentHeld.length, "directory is", "directories are")}{" "}
              waiting on your agreement
            </h3>

            <p className="mt-2 max-w-[46ch] text-[0.875rem] leading-relaxed text-ink-700">
              {consentHeld.map((row) => row.directory.name).join(", ")}{" "}
              {plural(consentHeld.length, "has", "have")} a required terms checkbox on the form. We
              never tick one on your behalf, so this run handed the listing back instead. Agree on
              the next run and we submit it end to end.
            </p>

            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link href="/#start">Start a run with consent</Link>
            </Button>
          </div>
        )}
      </div>
    </motion.section>
  );
}
