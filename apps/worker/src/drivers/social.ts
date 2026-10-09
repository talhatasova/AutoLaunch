import type { SubmissionOutcome } from "@directorylaunch/shared";
import { PermanentError, TransientError } from "../errors";
import type { PlatformAccount } from "./platform-session";
import type { SocialRecipe } from "./recipe";
import type { DriverReporter, SubmissionContext } from "./types";

/**
 * Launch-feed posts from DirectoryLaunch's own, bot-labelled accounts. A post is public
 * the moment the API accepts it, so the outcome URL is the live URL.
 */
type Payload = SubmissionContext["payload"] & { launch_post?: string | null };

export function composePost(payload: Payload, maxChars: number): string {
  const url = payload.url;
  const base = (payload.launch_post?.trim() || `${payload.name}: ${payload.tagline}`).replace(url, "").trim();
  const room = maxChars - url.length - 2;
  const chars = [...base];
  const body = chars.length > room ? `${chars.slice(0, room - 1).join("").trimEnd()}…` : base;
  return `${body}\n\n${url}`;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const detail = `${new URL(url).host} returned HTTP ${res.status}: ${text.slice(0, 300)}`;
    throw res.status === 429 || res.status >= 500 ? new TransientError(detail) : new PermanentError(detail);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function postBluesky(base: string, account: PlatformAccount, ctx: SubmissionContext, report: DriverReporter): Promise<string> {
  const session = await postJson(`${base}/xrpc/com.atproto.server.createSession`, {
    identifier: account.username,
    password: account.secret,
  }, {});
  const did = String(session.did);
  const text = composePost(ctx.payload, 300);
  const url = ctx.payload.url;
  const byteStart = Buffer.byteLength(text.slice(0, text.lastIndexOf(url)));
  await report.submitAttempted?.();
  const created = await postJson(`${base}/xrpc/com.atproto.repo.createRecord`, {
    repo: did,
    collection: "app.bsky.feed.post",
    record: {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      langs: ["en"],
      facets: [{
        index: { byteStart, byteEnd: byteStart + Buffer.byteLength(url) },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
      }],
      embed: {
        $type: "app.bsky.embed.external",
        external: { uri: url, title: ctx.payload.name, description: ctx.payload.tagline },
      },
    },
  }, { authorization: `Bearer ${String(session.accessJwt)}` });
  const rkey = String(created.uri).split("/").pop();
  return `https://bsky.app/profile/${String(session.handle ?? did)}/post/${rkey}`;
}

async function postMastodon(base: string, account: PlatformAccount, ctx: SubmissionContext, report: DriverReporter): Promise<string> {
  await report.submitAttempted?.();
  const status = await postJson(`${base}/api/v1/statuses`, {
    status: composePost(ctx.payload, 500),
    visibility: "public",
    language: "en",
  }, {
    authorization: `Bearer ${account.secret}`,
    // Mastodon de-duplicates on this key, so an ambiguous resend cannot double-post.
    "idempotency-key": ctx.submission_id,
  });
  return String(status.url);
}

export async function postToSocial(
  social: SocialRecipe,
  account: PlatformAccount,
  ctx: SubmissionContext,
  report: DriverReporter,
): Promise<SubmissionOutcome> {
  const base = social.base_url.replace(/\/$/, "");
  const postUrl = social.network === "bluesky"
    ? await postBluesky(base, account, ctx, report)
    : await postMastodon(base, account, ctx, report);
  await report.submitted(`Posted to ${ctx.directory.name}: ${postUrl}`);
  return { kind: "succeeded", result_url: postUrl };
}
