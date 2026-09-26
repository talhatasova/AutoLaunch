"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { profileSatisfies, type CompanyProfile } from "@directorylaunch/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { hostOf, plural } from "@/lib/format";
import { enterTransition, motionTokens } from "@/lib/motion";
import { useFounder } from "@/hooks/use-founder";
import { useSafeMotion } from "@/hooks/use-safe-motion";
import {
  ALL_DIRECTORIES,
  PROFILE_FIELD_LABEL,
  requirementsFor,
  type CompanyProfileField,
  type DirectoryView,
} from "@/lib/data";

/**
 * PRE-FLIGHT.
 *
 * The one screen between "paste a URL" and twenty-three submissions made in
 * someone's real name. Three things happen here and each is load-bearing:
 *
 *  1. IDENTITY. The founder sees the name and email that will be typed into
 *     every form, before it is. We do not invent either.
 *
 *  2. CONSENT, PER DIRECTORY. A directory whose form carries a terms checkbox
 *     gets its own agreement, naming that directory, linking to its own page.
 *     There is deliberately no "agree to everything" control: consent is not a
 *     volume discount. Declining is a first-class outcome - that directory
 *     comes back as a prepared payload, and nothing about the run is degraded.
 *
 *  3. COMPANY PROFILE, OPTIONAL. Some directories need details a product
 *     listing does not carry. Filling them promotes those directories from
 *     "ready for you" to automated. Leaving them empty is not an error and is
 *     never styled as one.
 *
 * Without step 2 the consent-gated directory can never run at all: the worker
 * refuses to tick a terms box unless `submissions.consent_granted_at` is set,
 * and that column is only ever written from this decision.
 */

interface CompanyProfileDraft {
  phone: string;
  employee_count: string;
  customer_count: string;
  competitors: string;
  founded_year: string;
}

const EMPTY_DRAFT: CompanyProfileDraft = {
  phone: "",
  employee_count: "",
  customer_count: "",
  competitors: "",
  founded_year: "",
};

/** Draft strings -> the payload shape, or null when the founder filled nothing. */
function toCompanyProfile(draft: CompanyProfileDraft): CompanyProfile | null {
  const competitors = draft.competitors
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const year = Number.parseInt(draft.founded_year, 10);

  const profile: CompanyProfile = {
    phone: draft.phone.trim() || null,
    employee_count: draft.employee_count.trim() || null,
    customer_count: draft.customer_count.trim() || null,
    competitors,
    founded_year: Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : null,
  };

  const empty =
    profile.phone === null &&
    profile.employee_count === null &&
    profile.customer_count === null &&
    profile.founded_year === null &&
    competitors.length === 0;

  // Null, not an object of nulls. An empty profile is "not provided", and the
  // fan-out planner reads it as exactly that.
  return empty ? null : profile;
}

export function LaunchComposer({ url, onCancel }: { url: string; onCancel: () => void }) {
  const router = useRouter();
  const safe = useSafeMotion(motionTokens.distance.md);
  const founderState = useFounder();

  const [consented, setConsented] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<CompanyProfileDraft>(EMPTY_DRAFT);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const consentDirectories = useMemo(
    () => ALL_DIRECTORIES.filter((directory) => requirementsFor(directory).requiresConsent),
    [],
  );
  const profileDirectories = useMemo(
    () => ALL_DIRECTORIES.filter((directory) => requirementsFor(directory).profileFields.length > 0),
    [],
  );

  const profile = useMemo(() => toCompanyProfile(draft), [draft]);

  // Live, honest count of what the profile as typed would unlock.
  const unlocked = profileDirectories.filter((directory) =>
    profileSatisfies(profile, requirementsFor(directory).profileFields as CompanyProfileField[]),
  ).length;

  const agreedSlugs = consentDirectories
    .map((directory) => directory.slug)
    .filter((slug) => consented[slug]);

  const automated = ALL_DIRECTORIES.filter((d) => d.tier !== 3).length;
  const willAutomate = agreedSlugs.length > 0 ? automated : automated - consentDirectories.length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);

    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          // Exactly the slugs whose own terms were ticked above. Never derived,
          // never defaulted, never carried over from another directory.
          consented_directory_slugs: agreedSlugs,
          company_profile: profile,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { data?: { fanout?: { total?: number; queued?: number } }; error?: { message?: string } }
        | null;

      if (response.status === 401) {
        toast("Sign in to launch", {
          description:
            "We submit under your own name and email, so we need to know whose they are.",
          action: { label: "Sign in", onClick: () => router.push("/auth/sign-in") },
        });
        return;
      }

      if (!response.ok) {
        toast.error("The launch did not start", {
          description: body?.error?.message ?? "Something went wrong before anything was sent.",
        });
        return;
      }

      const total = body?.data?.fanout?.total ?? ALL_DIRECTORIES.length;
      const queued = body?.data?.fanout?.queued ?? willAutomate;
      toast.success("Launch started", {
        description: `${total} directories on the board. ${queued} ${plural(
          queued,
          "is being submitted",
          "are being submitted",
        )} now; the rest come back as prepared payloads.`,
      });
      router.push("/dashboard");
    } catch {
      toast.error("We could not reach the launcher", {
        description: "Nothing was sent. Check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={safe.initial}
      animate={safe.animate}
      className="rule-t mt-10 border-t-2 border-t-ink pt-5"
      aria-labelledby="preflight-heading"
    >
      <p className="gutter-label">Pre-flight</p>
      <h2
        id="preflight-heading"
        className="t-display-sm mt-2 max-w-[22ch] text-[clamp(1.5rem,3.6vw,2.5rem)]"
      >
        Nothing is sent until you say so
      </h2>
      <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-700">
        We are about to submit <span className="t-data text-ink">{hostOf(url)}</span> to{" "}
        {ALL_DIRECTORIES.length} directories under your own name. Here is exactly what goes out.
      </p>

      <Identity state={founderState} />

      {consentDirectories.map((directory) => (
        <ConsentBlock
          key={directory.slug}
          directory={directory}
          checked={Boolean(consented[directory.slug])}
          onChange={(next) => setConsented((prev) => ({ ...prev, [directory.slug]: next }))}
        />
      ))}

      <ProfileBlock
        id="company-profile"
        directories={profileDirectories}
        draft={draft}
        open={profileOpen}
        unlocked={unlocked}
        onToggle={() => setProfileOpen((open) => !open)}
        onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
      />

      <div className="rule-t mt-8 flex flex-wrap items-center gap-4 pt-5">
        <Button type="submit" variant="signal" size="lg" disabled={pending}>
          {pending ? "Starting…" : `Submit to ${ALL_DIRECTORIES.length} directories`}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          Change the URL
        </Button>
        <p className="t-micro max-w-[34ch] text-ink-400">
          {willAutomate} submitted automatically · {ALL_DIRECTORIES.length - willAutomate} returned
          as prepared payloads
        </p>
      </div>
    </motion.form>
  );
}

/* -------------------------------------------------------------------------- */

function Identity({ state }: { state: ReturnType<typeof useFounder> }) {
  return (
    <section className="rule-t mt-8 pt-4" aria-labelledby="identity-heading">
      <h3 id="identity-heading" className="t-meta text-ink">
        Submitted as
      </h3>

      <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-[9rem_1fr]">
        <dt className="t-micro pt-1 text-ink-400">Founder name</dt>
        <dd className="t-data rule-b pb-2 text-ink">
          {state.status === "loading"
            ? "Reading your account…"
            : state.status === "signed_in"
              ? (state.founder.name ?? "Not on file — forms asking for a name stay manual")
              : "Sign in and we use the name on your account"}
        </dd>

        <dt className="t-micro pt-1 text-ink-400">Contact email</dt>
        <dd className="t-data rule-b pb-2 text-ink">
          {state.status === "signed_in"
            ? (state.founder.email ?? "—")
            : state.status === "loading"
              ? "Reading your account…"
              : "Sign in and we use the address on your account"}
        </dd>
      </dl>

      <p className="mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
        Both are your own, taken from your account. Several forms ask for a founder name and it is
        published next to the listing — we type yours, never an invented one, and never someone
        else&rsquo;s address.
      </p>
    </section>
  );
}

function ConsentBlock({
  directory,
  checked,
  onChange,
}: {
  directory: DirectoryView;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const requirements = requirementsFor(directory);
  const terms = requirements.termsUrl ?? directory.submission_url;

  return (
    <section
      className={cn(
        "rule-t mt-8 border-t-2 pt-4 state-transition",
        checked ? "border-t-signal" : "border-t-ink",
      )}
      aria-labelledby={`consent-${directory.slug}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 id={`consent-${directory.slug}`} className="t-meta text-ink">
          Your agreement — {directory.name}
        </h3>
        <motion.span
          key={checked ? "on" : "off"}
          initial={{ opacity: 0, y: motionTokens.distance.xs }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className={cn("t-micro", checked ? "text-signal" : "text-ink-400")}
        >
          {checked ? "agreed — we will submit it" : "not agreed — returned as a payload"}
        </motion.span>
      </div>

      <p className="mt-3 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-700">
        {requirements.consentStatement}
      </p>

      <a
        href={terms}
        target="_blank"
        rel="noreferrer noopener"
        className="t-micro mt-3 inline-flex cursor-pointer items-center gap-1.5 text-ink-500 underline-offset-4 hover:text-signal hover:underline"
      >
        Read {directory.name}&rsquo;s terms on {hostOf(directory.url)}
        <ArrowUpRight className="size-3" />
      </a>

      <div className="mt-4">
        <Checkbox
          name={`consent-${directory.slug}`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          label={
            <>
              I agree to <strong className="font-semibold">{directory.name}</strong>&rsquo;s terms,
              and to my listing being reviewed and published there under my name and email.
            </>
          }
          hint="Leave this unticked and we will not submit to them. The listing still comes back fully assembled, with their form one click away — the run is not degraded by declining."
        />
      </div>
    </section>
  );
}

function ProfileBlock({
  id,
  directories,
  draft,
  open,
  unlocked,
  onToggle,
  onChange,
}: {
  id: string;
  directories: DirectoryView[];
  draft: CompanyProfileDraft;
  open: boolean;
  unlocked: number;
  onToggle: () => void;
  onChange: (key: keyof CompanyProfileDraft, value: string) => void;
}) {
  if (directories.length === 0) return null;

  const fields = Array.from(
    new Set(directories.flatMap((directory) => requirementsFor(directory).profileFields)),
  );
  const reason = requirementsFor(directories[0]!).profileReason;

  return (
    <section id={id} className="rule-t mt-8 pt-4" aria-labelledby="profile-heading">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 id="profile-heading" className="t-meta text-ink">
          Company details — optional
        </h3>
        <motion.span
          key={unlocked}
          initial={{ opacity: 0, y: motionTokens.distance.xs }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className={cn("t-micro", unlocked > 0 ? "text-signal" : "text-ink-400")}
        >
          {unlocked > 0
            ? `unlocks ${unlocked} more ${plural(unlocked, "directory", "directories")}`
            : `complete these to unlock ${directories.length} more ${plural(directories.length, "directory", "directories")}`}
        </motion.span>
      </div>

      <p className="mt-3 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-700">{reason}</p>

      <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-500">
        Skip this and {directories.map((d) => d.name).join(", ")} simply come back as prepared
        payloads like the rest. Nothing fails, nothing is missing — this is an upgrade, not a
        requirement.
      </p>

      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onToggle}>
        {open ? "Hide company details" : `Add ${fields.length} details`}
      </Button>

      {/* Reveal is opacity + transform on an already-mounted subtree, so no
          height is animated and the fields are in the DOM for a screen reader
          the moment they matter. */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2"
        >
          {fields.includes("phone") && (
            <ProfileField
              label={PROFILE_FIELD_LABEL.phone}
              hint="Published on the listing. Use a number you are happy to be called on."
              value={draft.phone}
              inputMode="tel"
              onChange={(value) => onChange("phone", value)}
            />
          )}
          {fields.includes("employee_count") && (
            <ProfileField
              label={PROFILE_FIELD_LABEL.employee_count}
              hint="A range is fine — 1-10, 11-50."
              value={draft.employee_count}
              onChange={(value) => onChange("employee_count", value)}
            />
          )}
          {fields.includes("customer_count") && (
            <ProfileField
              label={PROFILE_FIELD_LABEL.customer_count}
              hint="However you count them. We will not estimate on your behalf."
              value={draft.customer_count}
              onChange={(value) => onChange("customer_count", value)}
            />
          )}
          {fields.includes("competitors") && (
            <ProfileField
              label={PROFILE_FIELD_LABEL.competitors}
              hint="Comma separated. These appear on the listing you get."
              value={draft.competitors}
              onChange={(value) => onChange("competitors", value)}
            />
          )}
          {fields.includes("founded_year") && (
            <ProfileField
              label={PROFILE_FIELD_LABEL.founded_year}
              hint="Four digits."
              value={draft.founded_year}
              inputMode="numeric"
              onChange={(value) => onChange("founded_year", value)}
            />
          )}
        </motion.div>
      )}
    </section>
  );
}

function ProfileField({
  label,
  hint,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "tel" | "numeric";
}) {
  const id = `profile-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="t-micro block text-ink-500">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
        className={cn(
          "mt-1 w-full border-0 border-b-2 border-ink/25 bg-transparent px-0 py-2 text-base text-ink",
          "outline-none transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          "hover:border-ink/50 focus:border-signal placeholder:text-ink-300",
        )}
      />
      <p id={`${id}-hint`} className="mt-1 text-[0.75rem] leading-snug text-ink-400">
        {hint}
      </p>
    </div>
  );
}
