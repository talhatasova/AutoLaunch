import {
  ALL_DIRECTORIES,
  TIER_DESCRIPTION,
  TIER_EMPTY_NOTE,
  TIER_LABEL,
  requirementsFor,
  type Tier,
} from "@/lib/data";
import { TierMark } from "@/components/ui/tier-mark";
import { hostOf, pad2, plural } from "@/lib/format";
import {
  Counter,
  Marquee,
  MaskedLines,
  Rise,
  Stagger,
  StaggerItem,
  ThemeSection,
} from "@/components/motion/primitives";

/* ============================================================================
   None of these sections carries a small-caps label above its heading. Where a
   section needs orientation, the heading does that job on its own; where a
   label appears it carries a value the heading does not (a count, a hostname).
   ========================================================================== */

/**
 * What used to be a three-card "how it works" grid.
 *
 * The content was never wrong - submitting genuinely is a sequence - but a row
 * of numbered cards is the house style of every generated landing page, and it
 * describes the process from the outside. This says the same thing from the
 * inside: the product is a machine that posts forms, so the process is shown
 * as the thing that machine actually emits. The log format is also the format
 * the dashboard uses, so the landing page is teaching the real UI.
 */
const RUN_LOG = [
  { t: "00:00", line: "read pagecrest.io — title, description, category, logo", tone: "muted" },
  { t: "00:00", line: "payload confirmed by founder — 23 directories queued", tone: "muted" },
  { t: "00:02", line: "the-startup-project — form filled, consent ticked, submitted", tone: "accent" },
  { t: "00:04", line: "startup-collections — form filled, submitted", tone: "accent" },
  { t: "00:04", line: "producthunt — Cloudflare challenge detected, stopping", tone: "head" },
  { t: "00:05", line: "alternativeto — login wall, payload assembled for you", tone: "head" },
  { t: "00:05", line: "softwaresuggest — needs company details, form opened", tone: "head" },
  { t: "00:06", line: "run complete — 2 live, 21 waiting on one click each", tone: "muted" },
] as const;

const TONE_CLASS = {
  muted: "fg-faint",
  accent: "fg-accent",
  head: "fg-heading",
} as const;

export function TheRun() {
  return (
    <ThemeSection theme="dark" className="py-24" aria-labelledby="run-heading">
      <div className="shell">
        <MaskedLines
          as="h2"
          className="t-display-sm fg-heading max-w-[18ch] text-[clamp(2rem,5.5vw,4.25rem)]"
          lines={[<>One URL in.</>, <>Every attempt</>, <>accounted for.</>]}
        />
        <Rise as="p" delay={0.2} className="fg-body mt-8 max-w-[56ch] text-[1rem] leading-relaxed">
          You paste a URL and confirm what we read off the page. After that the run is ours, and
          the only thing you get back is the truth about it — which listings went live, which ones
          hit something a machine should not push through, and exactly where each one stopped.
        </Rise>
      </div>

      {/* A sample run, in the format the dashboard uses. Illustrative rather
          than recorded - the host is the same placeholder the hero shows. */}
      <div className="shell mt-14">
        <Stagger
          as="ol"
          stagger={0.055}
          className="edge-heavy-t"
          aria-label="Sample run log for pagecrest.io"
        >
          {RUN_LOG.map((entry) => (
            <StaggerItem
              as="li"
              key={`${entry.t}-${entry.line}`}
              className="edge-b flex items-baseline gap-4 py-3 sm:gap-8"
            >
              <span className="t-data fg-faint shrink-0 tabular">{entry.t}</span>
              <span className={`t-data ${TONE_CLASS[entry.tone]}`}>{entry.line}</span>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* The full catalog as a ticker. It is the actual seeded list, so the
          band carries information rather than filling space. Pauses on hover
          and while the tab is hidden. */}
      <Marquee className="edge-t edge-b mt-16 py-5" seconds={64}>
        {ALL_DIRECTORIES.map((d) => (
          <span key={d.slug} className="t-meta fg-faint flex items-center gap-6 px-6">
            {d.name}
            <span className="fg-accent" aria-hidden>
              /
            </span>
          </span>
        ))}
      </Marquee>
    </ThemeSection>
  );
}

export function Tiers() {
  const tiers: Tier[] = [1, 2, 3];
  const counts = tiers.map((t) => ALL_DIRECTORIES.filter((d) => d.tier === t).length);

  return (
    <ThemeSection className="py-24" id="tiers" aria-labelledby="tiers-heading">
      <div className="shell">
        <MaskedLines
          as="h2"
          className="t-display-sm fg-heading max-w-[18ch] text-[clamp(2rem,5.5vw,4.25rem)]"
          lines={[<>We stop at the</>, <>CAPTCHA, on purpose</>]}
        />
        <Rise as="p" delay={0.18} className="fg-body mt-7 max-w-[58ch] text-[1rem] leading-relaxed">
          Solving a challenge means pretending to be a person who is not there. We do not do it. So
          every directory is graded by what it actually takes to get listed, and the grade is on
          the board where you can see it.
        </Rise>

        <Stagger className="mt-14 grid gap-8 md:grid-cols-3">
          {tiers.map((tier, i) => {
            const count = counts[i] ?? 0;
            const empty = count === 0;

            return (
              <StaggerItem
                as="article"
                key={tier}
                className={empty ? "edge-t pt-4" : "edge-heavy-t pt-4"}
              >
                <div className="flex items-center gap-3">
                  <TierMark tier={tier} />
                  {/* Tier 1 is empty. It gets the words "none yet", never a
                      count - a "0 directories" line reads as a number we are
                      embarrassed about, and any other number would be invented. */}
                  <span className="t-micro fg-faint tabular">
                    {empty ? "none yet" : `${count} ${plural(count, "directory", "directories")}`}
                  </span>
                </div>
                <h3
                  className={
                    empty
                      ? "t-head fg-faint mt-3 text-[1.375rem]"
                      : "t-head fg-heading mt-3 text-[1.375rem]"
                  }
                >
                  {TIER_LABEL[tier]}
                </h3>
                <p className="fg-body mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed">
                  {empty ? TIER_EMPTY_NOTE[tier] : TIER_DESCRIPTION[tier]}
                </p>
                {tier === 3 && (
                  <p className="fg-body mt-4 border-l-2 border-[var(--accent)] pl-3 text-[0.8125rem] leading-relaxed">
                    This is where most of the catalog lives, and that is the honest answer rather
                    than a shortfall. These are not failures and they are never hidden: the payload
                    is assembled, the form is open, and the listing is one click away.
                  </p>
                )}
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </ThemeSection>
  );
}

export function DirectoryLedger() {
  const rows = [...ALL_DIRECTORIES].sort(
    (a, b) => a.tier - b.tier || (b.domain_rating ?? 0) - (a.domain_rating ?? 0),
  );

  return (
    <ThemeSection className="py-24" id="directories" aria-labelledby="ledger-heading">
      <div className="shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2
            id="ledger-heading"
            className="t-display-sm fg-heading max-w-[16ch] text-[clamp(2rem,5.5vw,4.25rem)]"
          >
            <Counter to={rows.length} /> directories,
            <br />
            graded
          </h2>
          <Rise
            as="p"
            delay={0.12}
            className="fg-muted max-w-[38ch] text-[0.875rem] leading-relaxed"
          >
            Domain rating is a rough proxy for how much a link is worth. Tier is what it takes to
            get one.
          </Rise>
        </div>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <caption className="sr-only">
              Every directory DirectoryLaunch submits to, with its category, domain rating, tier
              and submission method.
            </caption>
            <thead>
              <tr className="edge-heavy-t border-b-2 border-b-[var(--border-heavy)]">
                <th scope="col" className="t-micro fg-faint w-10 py-2">
                  #
                </th>
                <th scope="col" className="t-micro fg-faint py-2">
                  Directory
                </th>
                <th scope="col" className="t-micro fg-faint py-2">
                  Category
                </th>
                <th scope="col" className="t-micro fg-faint py-2 text-right">
                  DR
                </th>
                <th scope="col" className="t-micro fg-faint py-2">
                  Tier
                </th>
                <th scope="col" className="t-micro fg-faint py-2">
                  Method
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.slug} className="edge-b state-transition group">
                  <td className="t-micro fg-faint py-3">{pad2(i + 1)}</td>
                  <td className="py-3">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="t-head fg-heading cursor-pointer text-[1rem] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                    >
                      {d.name}
                    </a>
                    <span className="t-micro fg-faint ml-2">{hostOf(d.url)}</span>
                  </td>
                  <td className="t-data fg-muted py-3">{d.category}</td>
                  <td className="t-data fg-body py-3 text-right">{d.domain_rating ?? "—"}</td>
                  <td className="py-3">
                    <TierMark tier={d.tier} />
                  </td>
                  <td className="t-micro fg-muted py-3">
                    {d.submission_method === "api"
                      ? "API"
                      : d.submission_method === "form"
                        ? "Form fill"
                        : "You, one click"}
                    {requirementsFor(d).requiresConsent && (
                      <span className="fg-accent ml-2">needs your consent</span>
                    )}
                    {requirementsFor(d).profileFields.length > 0 && (
                      <span className="fg-accent ml-2">needs company details</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ThemeSection>
  );
}
