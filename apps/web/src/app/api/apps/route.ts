import { NextResponse, type NextRequest } from "next/server";
import {
  submissionJobSchema,
  type SubmissionJob,
  type TablesInsert,
} from "@directorylaunch/shared";
import { createClient, requireUser } from "@/lib/supabase/server";
import { createAdminClient, assertOwnsApp } from "@/lib/supabase/admin";
import {
  ConflictError,
  DatabaseError,
  ValidationError,
  describeError,
  toErrorResponse,
} from "@/lib/http/errors";
import { launchRateLimiter } from "@/lib/http/rate-limit";
import { createAppRequestSchema } from "@/lib/api/apps-request";
import { scrapeSite } from "@/lib/scrape";
import { planFanout, type FanoutItem } from "@/lib/launch/fanout";
import { recordEvents, type EventDraft } from "@/lib/launch/events";
import { enqueueSubmissions } from "@/lib/queue/boss";
import { SUBMISSION_SELECT, buildSnapshot, type SubmissionWithDirectory } from "@/lib/launch/snapshot";

// The scrape makes an outbound request and pg-boss needs a TCP connection to
// Postgres. Neither works on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/apps - the whole launch, in one request.
 *
 *   1. Authenticate. 2. Rate limit. 3. Validate the URL.
 *   4. Scrape metadata through the SSRF guard.
 *   5. Insert the `apps` row.
 *   6. Fan out one `submissions` row per active directory - Tier 3 included,
 *      resolving to `needs_manual` so all 23 appear on the dashboard.
 *   7. Enqueue one pg-boss job per automatable row.
 *   8. Write the opening `submission_events` for every row.
 *
 * Ordering is deliberate. Steps 5 and 6 are the commit point: after them the
 * founder has a real launch, so nothing afterwards is allowed to turn into a
 * 5xx. Failures past that point are recorded against the rows they affect and
 * reported in the response body instead.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  let slot: { release: () => void } | null = null;

  try {
    const { userId, email, fullName } = await requireUser(supabase);

    // Keyed on the authenticated user, not the IP: this endpoint makes our
    // infrastructure fetch a URL of the caller's choosing, and the user id is
    // the identity we actually trust.
    const decision = launchRateLimiter.check(userId);
    if (!decision.allowed) {
      const { RateLimitError } = await import("@/lib/http/errors");
      throw new RateLimitError(
        decision.retryAfterSeconds,
        `user ${userId} exceeded the launch rate limit`,
      );
    }
    slot = decision;

    const body = await readJson(request);
    const parsed = createAppRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Check the details and try again.", {
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "(body)",
          message: issue.message,
        })),
      });
    }
    const input = parsed.data;

    // ---- Scrape ---------------------------------------------------------
    // Every control lives inside `scrapeSite` -> `safeFetch`: scheme allowlist,
    // DNS-first IP validation on every redirect hop, a 3-hop redirect cap, a
    // 2MB body cap, a 10s budget, and robots.txt.
    const scraped = await scrapeSite(input.url);

    const name = input.name ?? scraped.name;
    const tagline = input.tagline ?? scraped.tagline;
    const description = input.description ?? scraped.metadata.description;

    // ---- Directories ----------------------------------------------------
    const { data: directories, error: directoriesError } = await supabase
      .from("directories")
      .select("*")
      .eq("status", "active")
      .order("tier", { ascending: true })
      .order("name", { ascending: true });

    if (directoriesError) {
      throw new DatabaseError("select active directories", `${directoriesError.code}: ${directoriesError.message}`);
    }
    if (!directories || directories.length === 0) {
      throw new DatabaseError(
        "select active directories",
        "the catalog is empty - run `pnpm seed:directories`",
      );
    }

    const plan = planFanout(directories, {
      consentedSlugs: input.consented_directory_slugs,
      companyProfile: input.company_profile,
    });
    if (plan.length === 0) {
      throw new DatabaseError("plan fanout", "every directory in the catalog is marked broken");
    }

    // ---- Commit point: the app row --------------------------------------
    const appInsert: TablesInsert<"apps"> = {
      user_id: userId,
      // The URL AFTER redirects. Storing the input would mean submitting a
      // link that bounces, to 23 directories, under the founder's name.
      url: scraped.final_url,
      name,
      tagline,
      description,
      logo_url: scraped.metadata.favicon_url,
      screenshot_url: scraped.metadata.image_url,
      // Rows are created in this same request, so the launch is already running.
      status: "launching",
      scraped_at: new Date().toISOString(),
    };

    const { data: app, error: appError } = await supabase
      .from("apps")
      .insert(appInsert)
      .select("*")
      .single();

    if (appError || !app) {
      throw new DatabaseError(
        "insert app",
        `${appError?.code ?? "?"}: ${appError?.message ?? "no row returned"}`,
        { url: scraped.final_url },
      );
    }

    // ---- Fan out --------------------------------------------------------
    const submissionRows: TablesInsert<"submissions">[] = plan.map((item) => ({
      app_id: app.id,
      directory_id: item.directory.id,
      status: item.status,
      error_message: item.reason,
      attempt_count: 0,
      // The only source of consent the worker will accept. Non-null only where
      // the founder explicitly agreed to THAT directory's terms. There is no
      // UPDATE policy on submissions, so this cannot be back-filled later.
      consent_granted_at: item.consentGrantedAt,
    }));

    // One statement, so either every directory gets a row or none does. A
    // partial fan-out would show the founder a board that silently omits
    // directories we told them we cover.
    // Written with the service-role client, NOT the user's. `submissions` INSERT was
    // revoked from `authenticated` (migration 0007) because consent_granted_at authorises
    // us to tick a third party's terms box, and a value the client can write proves
    // nothing. Ownership is established first, through the user's own RLS-bound client, so
    // the tenancy decision still comes from the policy layer.
    await assertOwnsApp(supabase, app.id, userId);
    const admin = createAdminClient();
    const { error: submissionsError } = await admin.from("submissions").insert(submissionRows);

    if (submissionsError) {
      // 23505 is a unique violation, which here can only be
      // `submissions_app_directory_unique`. Handled explicitly rather than
      // allowed to escape as a 500: the storage layer is doing exactly its job.
      if (submissionsError.code === "23505") {
        throw new ConflictError(
          "This app has already been submitted to these directories.",
          `unique violation on submissions (app_id, directory_id) for app ${app.id}: ${submissionsError.details ?? submissionsError.message}`,
          { app_id: app.id },
        );
      }
      throw new DatabaseError(
        "insert submissions",
        `${submissionsError.code}: ${submissionsError.message}`,
        { app_id: app.id, rows: submissionRows.length },
      );
    }

    // ---- Past the commit point ------------------------------------------
    // The launch exists. From here on, a failure is reported into the timeline
    // and the response body, never as a 5xx.
    const { data: submissions, error: readbackError } = await supabase
      .from("submissions")
      .select(SUBMISSION_SELECT)
      .eq("app_id", app.id)
      .returns<SubmissionWithDirectory[]>();

    if (readbackError || !submissions) {
      throw new DatabaseError(
        "read back submissions",
        `${readbackError?.code ?? "?"}: ${readbackError?.message ?? "no rows returned"}`,
        { app_id: app.id },
      );
    }

    const byDirectoryId = new Map(submissions.map((s) => [s.directory_id, s]));
    const planByDirectoryId = new Map<string, FanoutItem>(plan.map((item) => [item.directory.id, item]));

    // ---- Enqueue --------------------------------------------------------
    const jobs: SubmissionJob[] = [];
    for (const item of plan) {
      if (!item.enqueue) continue;
      const submission = byDirectoryId.get(item.directory.id);
      if (!submission) continue;
      jobs.push(
        submissionJobSchema.parse({
          submission_id: submission.id,
          app_id: app.id,
          directory_id: item.directory.id,
          attempt: 0,
        }),
      );
    }

    const enqueueResult = await enqueueSubmissions(jobs);

    // ---- Timeline -------------------------------------------------------
    const events: EventDraft[] = [];
    for (const submission of submissions) {
      const item = planByDirectoryId.get(submission.directory_id);
      if (!item) continue;

      const enqueueFailed = item.enqueue && enqueueResult.failure !== null;

      events.push({
        submission_id: submission.id,
        kind: item.eventKind,
        message: enqueueFailed
          ? `${item.reason} The job could not be queued yet and will be picked up by the next worker sweep.`
          : item.reason,
        payload: {
          tier: item.directory.tier,
          submission_method: item.directory.submission_method,
          requires_captcha: item.directory.requires_captcha,
          enqueued: item.enqueue && !enqueueFailed,
          // Everything below is what a person debugging this from the dashboard
          // needs and would otherwise have to reproduce the request to get.
          scraped_from: scraped.final_url,
          redirect_chain: scraped.chain,
          scrape_notes: scraped.notes,
          ...(enqueueFailed ? { enqueue_error: enqueueResult.failure } : {}),
        },
      });
    }

    const eventResult = await recordEvents(supabase, events);

    const snapshot = buildSnapshot(app, submissions, [], { contactEmail: email });

    return NextResponse.json(
      {
        data: {
          ...snapshot,
          scrape: {
            final_url: scraped.final_url,
            notes: scraped.notes,
            redirect_chain: scraped.chain,
          },
          fanout: {
            total: submissions.length,
            queued: plan.filter((p) => p.status === "queued").length,
            needs_manual: plan.filter((p) => p.status === "needs_manual").length,
            enqueued: enqueueResult.enqueued,
            // Surfaced rather than hidden: the founder's board is correct, but
            // an operator reading this response should see the degradation.
            enqueue_error: enqueueResult.failure,
            events_written: eventResult.written,
            events_error: eventResult.failure,
          },
          // The founder's own name, for forms that ask for one. Null if Google
          // gave us nothing - we do not invent a persona.
          founder_name: fullName,
        },
      },
      { status: 201, headers: { location: `/api/launches/${app.id}` } },
    );
  } catch (error) {
    // A request that never reached the commit point did not spend the
    // founder's launch budget, so give the slot back.
    slot?.release();
    return toErrorResponse(error, "POST /api/apps");
  }
}

/** GET /api/apps - the caller's own apps, newest first. RLS does the filtering. */
export async function GET() {
  const supabase = await createClient();

  try {
    await requireUser(supabase);

    const { data, error } = await supabase
      .from("apps")
      .select("id, url, name, tagline, status, scraped_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new DatabaseError("list apps", `${error.code}: ${error.message}`);
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return toErrorResponse(error, "GET /api/apps");
  }
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new ValidationError("The request body was not valid JSON.", {
      detail: describeError(error),
    });
  }
}
