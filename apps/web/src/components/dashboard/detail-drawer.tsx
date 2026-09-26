"use client";

import { Drawer } from "vaul";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierMark } from "@/components/ui/tier-mark";
import { StatusLabel } from "./status-mark";
import { hostOf } from "@/lib/format";
import {
  PROFILE_FIELD_LABEL,
  TIER_DESCRIPTION,
  requirementsFor,
  type LaunchApp,
  type LaunchRow,
} from "@/lib/data";

/**
 * Directory detail. Vaul, so the sheet is draggable and the physics are the
 * platform's rather than something we invented.
 *
 * The payload block is the honest part of the product: for a needs_manual row
 * this is the whole value proposition made literal - here is exactly what to
 * paste, and here is whose email goes in the contact field.
 */
export function DetailDrawer({
  row,
  app,
  onClose,
}: {
  row: LaunchRow | null;
  app: LaunchApp | null;
  onClose: () => void;
}) {
  const open = Boolean(row && app);
  const requirements = row ? requirementsFor(row.directory) : null;

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/45" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[88vh] flex-col rounded-t-[2px] border-t-2 border-ink bg-paper-raised outline-none"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 bg-rule-strong" />

          {row && app ? (
            <div className="overflow-y-auto px-5 pt-6 pb-10 sm:px-8">
              <div className="mx-auto w-full max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <TierMark tier={row.directory.tier} />
                  <span className="t-micro text-ink-400">{row.directory.category}</span>
                  {row.directory.domain_rating !== null && (
                    <span className="t-micro tabular text-ink-400">DR {row.directory.domain_rating}</span>
                  )}
                </div>

                <Drawer.Title className="t-display mt-3 text-[clamp(2rem,7vw,3.25rem)]">
                  {row.directory.name}
                </Drawer.Title>

                <a
                  href={row.directory.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="t-meta mt-2 inline-block cursor-pointer text-ink-500 underline-offset-4 hover:text-signal hover:underline"
                >
                  {hostOf(row.directory.url)}
                </a>

                <div className="rule-t mt-6 flex flex-wrap items-center justify-between gap-4 pt-4">
                  <StatusLabel status={row.status} attempt={row.attempt} />
                  {(row.status === "needs_manual" || row.status === "succeeded") && (
                    <Button
                      asChild
                      variant={row.status === "needs_manual" ? "signal" : "ink"}
                      size="sm"
                    >
                      <a
                        href={row.status === "succeeded" && row.result_url ? row.result_url : row.directory.submission_url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {row.status === "succeeded" ? "View listing" : "Open the form"}
                        <ArrowUpRight />
                      </a>
                    </Button>
                  )}
                </div>

                <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-700">{row.detail}</p>

                <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
                  {TIER_DESCRIPTION[row.directory.tier]}
                </p>

                <section className="mt-8">
                  <h3 className="t-meta rule-b pb-2">What we submit</h3>
                  <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
                    <Field label="Name" value={app.name} />
                    <Field label="Tagline" value={app.tagline} />
                    <Field label="URL" value={app.url} />
                    <Field label="Category" value={app.category} />
                    <Field label="Contact email" value={app.contact_email} />
                    <Field
                      label="Founder name"
                      value={
                        app.founder_name ??
                        "Not on file — forms that require a name stay manual until it is"
                      }
                    />
                  </dl>
                  <p className="mt-4 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
                    The contact email and founder name are your own, taken from your account. Real
                    forms ask for a name and publish it beside the listing — we type yours, and we
                    never invent an identity to create an account on a directory.
                  </p>
                </section>

                {requirements?.requiresConsent && (
                  <section className="rule-t mt-8 border-t-2 border-t-signal pt-4">
                    <h3 className="t-meta text-ink">Your agreement</h3>
                    <p className="mt-3 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-700">
                      {requirements.consentStatement}
                    </p>
                    <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
                      {row.status === "succeeded"
                        ? "You agreed to these terms before this run started, which is the only reason we ticked the box on the form."
                        : "We will not tick that box for you. Agree on your next run and this one goes out automatically."}
                    </p>
                  </section>
                )}

                {requirements && requirements.profileFields.length > 0 && (
                  <section className="rule-t mt-8 border-t-2 border-t-signal pt-4">
                    <h3 className="t-meta text-ink">What would unlock this one</h3>
                    <p className="mt-3 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-700">
                      {requirements.profileReason}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {requirements.profileFields.map((field) => (
                        <li
                          key={field}
                          className="t-micro border border-rule-strong px-2 py-1 text-ink-500"
                        >
                          {PROFILE_FIELD_LABEL[field]}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
                      Add these once and the next run submits this directory for you. Until then it
                      arrives here, assembled — which is not a failure, just a longer route.
                    </p>
                  </section>
                )}
              </div>
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="t-micro pt-1 text-ink-400">{label}</dt>
      <dd className="t-data rule-b pb-3 break-words text-ink">{value}</dd>
    </>
  );
}
