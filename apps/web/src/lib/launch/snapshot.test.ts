import { describe, expect, it } from "vitest";
import type { Tables } from "@directorylaunch/shared";
import { buildSnapshot, type SubmissionWithDirectory } from "./snapshot";

type AppRow = Tables<"apps">;
type EventRow = Tables<"submission_events">;

const APP: AppRow = {
  id: "app-1",
  user_id: "user-1",
  url: "https://pagecrest.io",
  name: "Pagecrest",
  tagline: "Turn your changelog into a weekly customer email",
  description: "Long description.",
  logo_url: null,
  screenshot_url: null,
  status: "launching",
  scraped_at: "2026-08-24T10:00:00Z",
  created_at: "2026-08-24T10:00:00Z",
};

function submission(overrides: Partial<SubmissionWithDirectory> = {}): SubmissionWithDirectory {
  return {
    id: "sub-1",
    app_id: "app-1",
    directory_id: "dir-1",
    status: "queued",
    submitted_at: null,
    result_url: null,
    error_message: null,
    attempt_count: 0,
    next_attempt_at: null,
    consent_granted_at: null,
    created_at: "2026-08-24T10:00:00Z",
    directories: {
      id: "dir-1",
      slug: "the-startup-project",
      name: "The Startup Project",
      url: "https://startupproject.org",
      submission_url: "https://startupproject.org/submit-startup/",
      tier: 2,
      submission_method: "form",
      requires_captcha: false,
      category: "startup",
      domain_rating: null,
      status: "active",
    },
    ...overrides,
  };
}

describe("buildSnapshot - shape the dashboard already expects", () => {
  it("maps a submission row onto a LaunchRow with a DirectoryView", () => {
    const snapshot = buildSnapshot(APP, [submission()], []);
    const row = snapshot.launch.rows[0];

    expect(row?.id).toBe("sub-1");
    expect(row?.status).toBe("queued");
    expect(row?.result_url).toBeNull();
    expect(row?.attempt).toBe(0);
    expect(row?.directory).toEqual({
      slug: "the-startup-project",
      name: "The Startup Project",
      url: "https://startupproject.org",
      submission_url: "https://startupproject.org/submit-startup/",
      tier: 2,
      submission_method: "form",
      requires_captcha: false,
      category: "startup",
      domain_rating: null,
      // `health` is the directory's own status, renamed so it cannot be
      // confused with the submission's status.
      health: "active",
    });
  });

  it("carries the app across as a LaunchApp, with contact_email from the session", () => {
    const snapshot = buildSnapshot(APP, [submission()], [], { contactEmail: "founder@example.com" });
    expect(snapshot.launch.app).toEqual({
      id: "app-1",
      name: "Pagecrest",
      tagline: "Turn your changelog into a weekly customer email",
      url: "https://pagecrest.io",
      category: "startup",
      contact_email: "founder@example.com",
    });
  });

  it("uses the app id as the launch id, because one app is one launch", () => {
    expect(buildSnapshot(APP, [submission()], []).launch.id).toBe("app-1");
  });

  it("never emits null where the view model demands a string", () => {
    const bare: AppRow = { ...APP, tagline: null, description: null };
    const snapshot = buildSnapshot(bare, [submission()], []);
    expect(typeof snapshot.launch.app.tagline).toBe("string");
    expect(typeof snapshot.launch.app.contact_email).toBe("string");
  });
});

describe("buildSnapshot - detail is the one sentence the founder reads", () => {
  it("explains a Tier 3 needs_manual row as work done, not as a failure", () => {
    const snapshot = buildSnapshot(
      APP,
      [
        submission({
          status: "needs_manual",
          error_message: "Product Hunt requires a signed-in account.",
          directories: { ...submission().directories, slug: "product-hunt", tier: 3, submission_method: "manual", requires_captcha: true },
        }),
      ],
      [],
    );
    const detail = snapshot.launch.rows[0]?.detail ?? "";
    expect(detail).toContain("Product Hunt requires a signed-in account.");
    expect(detail).not.toMatch(/\bfail(ed|ure)\b/i);
  });

  it("prefers the stored error_message over a generic sentence for a real failure", () => {
    const snapshot = buildSnapshot(
      APP,
      [submission({ status: "failed", error_message: "Selector #tagline was not found on the form." })],
      [],
    );
    expect(snapshot.launch.rows[0]?.detail).toContain("Selector #tagline was not found");
  });

  it("says something useful for every status even when error_message is null", () => {
    for (const status of ["queued", "running", "succeeded", "failed", "needs_manual"] as const) {
      const snapshot = buildSnapshot(APP, [submission({ status, error_message: null })], []);
      expect((snapshot.launch.rows[0]?.detail ?? "").length, status).toBeGreaterThan(10);
    }
  });

  it("mentions the retry attempt when one is scheduled", () => {
    const snapshot = buildSnapshot(
      APP,
      [submission({ status: "queued", attempt_count: 1, next_attempt_at: "2026-08-24T10:05:00Z" })],
      [],
    );
    expect(snapshot.launch.rows[0]?.detail).toMatch(/attempt 2/i);
  });
});

describe("buildSnapshot - events", () => {
  const event = (overrides: Partial<EventRow> = {}): EventRow => ({
    id: "evt-1",
    submission_id: "sub-1",
    kind: "queued",
    message: "Queued for submission.",
    payload: null,
    created_at: "2026-08-24T10:00:01Z",
    ...overrides,
  });

  it("joins each event to its directory so the log can name it", () => {
    const snapshot = buildSnapshot(APP, [submission()], [event()]);
    expect(snapshot.events[0]).toEqual({
      id: "evt-1",
      submission_id: "sub-1",
      directory_slug: "the-startup-project",
      directory_name: "The Startup Project",
      kind: "queued",
      message: "Queued for submission.",
      at: "2026-08-24T10:00:01Z",
    });
  });

  it("returns events oldest first - the hook reverses them for a live tail", () => {
    const snapshot = buildSnapshot(APP, [submission()], [
      event({ id: "b", created_at: "2026-08-24T10:00:05Z" }),
      event({ id: "a", created_at: "2026-08-24T10:00:01Z" }),
    ]);
    expect(snapshot.events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("drops an orphan event rather than emitting a row with an empty directory name", () => {
    const snapshot = buildSnapshot(APP, [submission()], [event({ id: "orphan", submission_id: "sub-999" })]);
    expect(snapshot.events).toHaveLength(0);
  });
});

describe("buildSnapshot - launch status", () => {
  it("is launching while anything is still queued or running", () => {
    const snapshot = buildSnapshot(
      APP,
      [submission({ id: "a", status: "succeeded" }), submission({ id: "b", status: "queued" })],
      [],
    );
    expect(snapshot.launch.status).toBe("launching");
  });

  it("is done once every row has reached a terminal state", () => {
    const snapshot = buildSnapshot(
      APP,
      [
        submission({ id: "a", status: "succeeded" }),
        submission({ id: "b", status: "needs_manual" }),
        submission({ id: "c", status: "failed" }),
      ],
      [],
    );
    expect(snapshot.launch.status).toBe("done");
  });

  it("treats an app with no submissions as its stored status rather than claiming done", () => {
    const snapshot = buildSnapshot({ ...APP, status: "draft" }, [], []);
    expect(snapshot.launch.status).toBe("draft");
    expect(snapshot.launch.rows).toEqual([]);
  });
});
