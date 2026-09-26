import type {
  Directory,
  SubmissionOutcome,
  SubmissionPayload,
} from "@directorylaunch/shared";
import type { DomSnapshot } from "./challenge";

/**
 * Explicit, per-directory consent captured from the founder in the UI.
 *
 * Recorded at enqueue time. `null` means the user has not agreed to that directory's
 * terms, and a form with a consent checkbox therefore resolves needs_manual. We never tick
 * a terms box speculatively - accepting someone's terms on their behalf is the same family
 * of wrong as fabricating their identity.
 */
export interface ConsentGrant {
  directory_slug: string;
  granted_at: string;
}

/** Everything a driver is allowed to see. Assembled once, in payload/build.ts. */
export interface SubmissionContext {
  submission_id: string;
  directory: Directory;
  payload: SubmissionPayload;
  consent: ConsentGrant | null;
}

/** Progress reporting. Each call becomes a submission_events row - see queue/reporter.ts. */
export interface DriverReporter {
  submitAttempted?(): Promise<void>;
  fieldFilled(selector: string, payloadKey: string): Promise<void>;
  submitted(detail: string): Promise<void>;
  note(kind: "started", message: string, payload?: Record<string, unknown>): Promise<void>;
}

export interface Driver {
  readonly tier: 1 | 2 | 3;
  run(ctx: SubmissionContext, report: DriverReporter): Promise<SubmissionOutcome>;
}

/**
 * The narrow browser surface the generic Tier 2 driver needs.
 *
 * The driver is written against this rather than against Playwright directly for two
 * reasons: the ethical checks (challenge detection, honeypot assertions, consent gating)
 * become unit-testable without launching Chromium, and the Playwright adapter stays a thin
 * translation layer with no policy in it.
 */
export interface PageLike {
  goto(url: string): Promise<{ status: number | null }>;
  /** Current URL after any redirects. */
  currentUrl(): Promise<string>;
  /** LIVE DOM snapshot, taken after render. Never the raw server HTML. */
  snapshot(): Promise<DomSnapshot>;
  exists(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  setChecked(selector: string, checked: boolean): Promise<void>;
  /** Current value of an input. Used to prove honeypots stayed empty. */
  readValue(selector: string): Promise<string>;
  click(selector: string): Promise<void>;
  /** Visible text of the document body, for text_present success signals. */
  visibleText(): Promise<string>;
  /** Let navigation / XHR settle after submit. */
  settle(ms: number): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserPool {
  newPage(): Promise<PageLike>;
  shutdown(): Promise<void>;
}
