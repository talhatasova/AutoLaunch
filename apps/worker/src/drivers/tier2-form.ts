import { profileSatisfies } from "@directorylaunch/shared";
import type { CompanyProfileField, SubmissionOutcome } from "@directorylaunch/shared";
import {
  ChallengeDetectedError,
  HoneypotViolationError,
  ManualRequiredError,
  PermanentError,
  SelectorMissingError,
  classifyUnknownError,
  outcomeForHttpStatus,
} from "../errors";
import { resolvePayloadValue } from "../payload/values";
import { detectChallenge } from "./challenge";
import { consentDecision } from "./consent";
import { parseFormSchema } from "./form-schema";
import type { ExtraField, FormField, FormSchema } from "./form-schema";
import {
  UNCONFIRMED_REASON,
  describeSignal,
  evaluateSuccessSignal,
  unconfirmedDetail,
} from "./success";
import type { Driver, DriverReporter, PageLike, SubmissionContext } from "./types";

/**
 * THE generic Tier 2 driver. One driver, every form-based directory.
 *
 * There is no per-directory branch anywhere in this file and there must never be one.
 * Everything site-specific - selectors, field mapping, the controls that sit outside
 * SubmissionPayload, the honeypots, the success signal - comes from
 * `directories.form_schema`. Adding a directory is a seed-file row; a directory changing
 * its form is a row update. Neither is a deploy.
 *
 * The ethical gates run before anything is typed into the page, because a challenge or a
 * missing consent must stop us BEFORE we have interacted with the site.
 */
export class Tier2FormDriver implements Driver {
  readonly tier = 2 as const;

  constructor(
    private readonly openPage: () => Promise<PageLike>,
    private readonly settleMs = 2_500,
  ) {}

  async run(ctx: SubmissionContext, report: DriverReporter): Promise<SubmissionOutcome> {
    const parsed = parseFormSchema(ctx.directory.form_schema);
    if (!parsed.ok) {
      // A Tier 2 row with an unusable form_schema is our data bug, not the site's.
      return new PermanentError(
        `${ctx.directory.slug}: form_schema is invalid (${parsed.error}). ` +
          `Fix the directory row; retrying cannot help.`,
      ).outcome;
    }
    const schema = parsed.value;

    // Gates that need no browser at all. Checking them first means we do not even open a
    // connection to a site whose submission we are going to refuse.
    const preflight = preflightGates(ctx, schema);
    if (preflight) return preflight;

    let page: PageLike | null = null;
    try {
      page = await this.openPage();
      return await this.drive(page, ctx, schema, report);
    } catch (e) {
      // Never swallowed: every unknown throw is classified into a concrete outcome and the
      // original message is preserved verbatim in the detail.
      return classifyUnknownError(e);
    } finally {
      if (page) {
        // A page we cannot close must not mask the real outcome.
        await page.close().catch(() => undefined);
      }
    }
  }

  private async drive(
    page: PageLike,
    ctx: SubmissionContext,
    schema: FormSchema,
    report: DriverReporter,
  ): Promise<SubmissionOutcome> {
    const { directory, payload } = ctx;

    const nav = await page.goto(directory.submission_url);
    if (nav.status !== null && (nav.status < 200 || nav.status >= 300)) {
      return outcomeForHttpStatus(
        nav.status,
        `${directory.submission_url} returned HTTP ${nav.status}`,
      );
    }

    // ------------------------------------------------------------------------------
    // CHALLENGE CHECK #1 - against the LIVE DOM, after render.
    //
    // Not the raw server HTML. Future Tools serves a clean CAPTCHA-free form to curl and
    // injects Turnstile client-side once the page runs; a static check would have walked
    // straight past it and failed silently on the exact site it most needed to catch.
    // ------------------------------------------------------------------------------
    const beforeFill = await page.snapshot();
    const challengeBefore = detectChallenge(beforeFill);
    if (challengeBefore) {
      throw new ChallengeDetectedError(
        `${challengeBefore.detail} [${challengeBefore.kind}; ${challengeBefore.evidence}]`,
      );
    }

    await report.note("started", `Opened ${directory.submission_url}`, {
      directory_slug: directory.slug,
      challenge_scan: "clean_after_render",
    });

    // Honeypots must be empty BEFORE we touch anything, so a later non-empty value is
    // unambiguously ours rather than a pre-filled decoy.
    await assertHoneypotsEmpty(page, schema.honeypots);

    // Every required selector must exist before we type anything. A partial fill into a
    // form that has changed shape is worse than not starting.
    await assertRequiredSelectorsPresent(page, schema);

    const filled: string[] = [];
    for (const field of schema.fields) {
      const present = await page.exists(field.selector);
      // Required-and-missing was already caught above, so an absent control here is
      // optional and simply skipped.
      if (!present) continue;

      const resolution = resolvePayloadValue(payload, field.payload_key);
      if (!resolution.ok) {
        throw new PermanentError(
          `${directory.slug}: form_schema maps ${field.selector} to ${resolution.reason}.`,
        );
      }
      if (resolution.value === "" && field.required) {
        // We have nothing truthful to put here, so we do not put anything.
        throw new ManualRequiredError(
          `${directory.name} requires "${field.payload_key}" and your listing has no value ` +
            `for it. Fill that in and we can automate this one.`,
        );
      }
      if (resolution.value === "") continue;

      await applyField(page, field, resolution.value);
      filled.push(field.payload_key);
      await report.fieldFilled(field.selector, field.payload_key);
    }

    // Controls the form needs that SubmissionPayload does not carry.
    for (const extra of schema.extra_fields) {
      await applyExtraField(page, extra, ctx);
    }

    // Honeypots again, AFTER filling. This is the assertion that matters: it proves no
    // selector in the schema accidentally aliased a bot trap. A filled honeypot means the
    // submission is silently discarded while the page still looks like success, so we
    // abort rather than send it.
    await assertHoneypotsEmpty(page, schema.honeypots);

    // ------------------------------------------------------------------------------
    // CHALLENGE CHECK #2 - immediately before submit.
    //
    // Widgets are frequently mounted in response to interaction (focus, first keystroke,
    // form validity). A page that was clean at load can be challenged by the time we click.
    // ------------------------------------------------------------------------------
    const beforeSubmit = await page.snapshot();
    const challengeAtSubmit = detectChallenge(beforeSubmit);
    if (challengeAtSubmit) {
      throw new ChallengeDetectedError(
        `${challengeAtSubmit.detail} It appeared after the form was filled ` +
          `[${challengeAtSubmit.kind}; ${challengeAtSubmit.evidence}]`,
      );
    }

    if (!(await page.exists(schema.submit_selector))) {
      throw new SelectorMissingError(
        schema.submit_selector,
        "submit control not found - the form changed",
      );
    }

    await page.click(schema.submit_selector);
    await report.submitted(
      `Submitted ${filled.length} mapped fields to ${directory.name}; waiting for ` +
        `${describeSignal(schema.success_signal)}.`,
    );
    await page.settle(this.settleMs);

    // A challenge served IN RESPONSE to the submit is still a challenge. We report it and
    // stop; we never resubmit to get past it.
    const afterSubmit = await page.snapshot();
    const challengeAfter = detectChallenge(afterSubmit);
    if (challengeAfter) {
      throw new ChallengeDetectedError(
        `${challengeAfter.detail} It was served in response to the submission, so we cannot ` +
          `confirm whether the listing was accepted ` +
          `[${challengeAfter.kind}; ${challengeAfter.evidence}]`,
      );
    }

    const signal = schema.success_signal;
    const observation = {
      url: await page.currentUrl(),
      visibleText: await page.visibleText(),
      selectorPresent:
        signal.kind === "selector_present" ? await page.exists(signal.value) : false,
    };

    const evaluation = evaluateSuccessSignal(signal, observation);
    if (evaluation.kind === "confirmed") {
      return { kind: "succeeded", result_url: observation.url || null };
    }

    // Explicitly ambiguous. Never silent success, never silent failure.
    throw new ManualRequiredError(`${UNCONFIRMED_REASON}: ${unconfirmedDetail(evaluation)}`);
  }
}

/**
 * Gates evaluated before any network contact. Returns an outcome to short-circuit with,
 * or null to proceed.
 */
export function preflightGates(
  ctx: SubmissionContext,
  schema: FormSchema,
): SubmissionOutcome | null {
  const { directory, payload } = ctx;

  // A directory flagged requires_captcha should never reach a Tier 2 driver, but if the
  // catalog says there is a challenge we believe it and stop rather than "just checking".
  if (directory.requires_captcha) {
    return {
      kind: "challenge_detected",
      detail:
        `${directory.name} is recorded as CAPTCHA-protected. We do not attempt automated ` +
        `submission behind a challenge.`,
    };
  }

  // Unmet profile requirements are needs_manual, NOT a failure. Nothing is broken - the
  // founder simply has not filled in an optional section yet.
  const required = directory.requires_profile_fields as CompanyProfileField[];
  if (!profileSatisfies(payload.company_profile ?? null, required)) {
    const missing = required.filter((f) => {
      const v = payload.company_profile?.[f];
      return Array.isArray(v) ? v.length === 0 : v === null || v === undefined || v === "";
    });
    const named = missing.length > 0 ? missing.join(", ") : required.join(", ");
    return {
      kind: "manual_required",
      detail:
        `${directory.name} asks for ${named}, which your company profile does not have yet. ` +
        `We will not invent these - they get published under your name. Complete that ` +
        `section and this directory becomes automatable.`,
    };
  }

  const consent = consentDecision(directory, schema, ctx.consent);
  if (!consent.ok) {
    return { kind: "manual_required", detail: consent.reason };
  }

  return null;
}

async function assertRequiredSelectorsPresent(page: PageLike, schema: FormSchema): Promise<void> {
  const required: Array<{ selector: string; what: string }> = [
    ...schema.fields
      .filter((f) => f.required)
      .map((f) => ({ selector: f.selector, what: `field ${f.payload_key}` })),
    ...schema.extra_fields
      .filter((f) => f.required)
      .map((f) => ({ selector: f.selector, what: `extra field (${f.source})` })),
  ];
  for (const r of required) {
    if (!(await page.exists(r.selector))) {
      // The form changed. Retrying blindly against a form that no longer exists cannot
      // succeed - the caller marks the directory broken.
      throw new SelectorMissingError(r.selector, `required ${r.what} not found`);
    }
  }
}

/**
 * Honeypots MUST stay empty. This only ever reads them; nothing in this file writes one.
 *
 * A honeypot that is absent from the page is fine - forms drop them. A honeypot carrying a
 * value is fatal: startupproject.org's `fax_number` is the documented example, and filling
 * it means the submission is discarded while the response still looks like success.
 */
export async function assertHoneypotsEmpty(page: PageLike, honeypots: string[]): Promise<void> {
  for (const selector of honeypots) {
    if (!(await page.exists(selector))) continue;
    const value = await page.readValue(selector);
    if (value !== "") {
      throw new HoneypotViolationError(selector, value);
    }
  }
}

async function applyField(page: PageLike, field: FormField, value: string): Promise<void> {
  switch (field.type) {
    case "select":
      await page.selectOption(field.selector, value);
      return;
    case "checkbox":
      await page.setChecked(field.selector, value !== "" && value !== "false");
      return;
    case "file":
      // We are not going to guess at a binary upload. Honest handoff instead.
      throw new ManualRequiredError(
        `This form needs a file uploaded at ${field.selector}, which we do not automate.`,
      );
    case "text":
    case "textarea":
    case "email":
    case "url":
      await page.fill(field.selector, value);
      return;
  }
}

async function applyExtraField(
  page: PageLike,
  extra: ExtraField,
  ctx: SubmissionContext,
): Promise<void> {
  const present = await page.exists(extra.selector);
  if (!present) {
    if (extra.required) {
      throw new SelectorMissingError(
        extra.selector,
        `required extra field (${extra.source}) not found`,
      );
    }
    return;
  }

  switch (extra.source) {
    case "founder_name": {
      // The authenticated founder's REAL name from their own profile. Not a persona.
      const name = ctx.payload.founder_name;
      if (!name) {
        throw new ManualRequiredError(
          `${ctx.directory.name} asks for a founder name and your profile has none. ` +
            `We will not make one up.`,
        );
      }
      if (extra.type === "select") await page.selectOption(extra.selector, name);
      else await page.fill(extra.selector, name);
      return;
    }
    case "consent": {
      // consentDecision() already ran in preflightGates and refused the job if consent was
      // absent. This re-check is deliberate belt-and-braces: reaching a tick without a
      // recorded grant must be impossible, not merely unlikely.
      const decision = consentDecision(ctx.directory, { extra_fields: [extra] }, ctx.consent);
      if (!decision.ok) throw new ManualRequiredError(decision.reason);
      if (extra.type !== "checkbox") {
        throw new PermanentError(
          `${ctx.directory.slug}: consent control ${extra.selector} is declared as ` +
            `"${extra.type}"; only a checkbox can express agreement.`,
        );
      }
      await page.setChecked(extra.selector, true);
      return;
    }
    case "constant": {
      const value = extra.value ?? "";
      if (value === "" && extra.required) {
        throw new PermanentError(
          `${ctx.directory.slug}: required constant extra field ${extra.selector} has no value.`,
        );
      }
      if (value === "") return;
      if (extra.type === "select") await page.selectOption(extra.selector, value);
      else if (extra.type === "checkbox") await page.setChecked(extra.selector, value !== "false");
      else await page.fill(extra.selector, value);
      return;
    }
  }
}
