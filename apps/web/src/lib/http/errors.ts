import { NextResponse } from "next/server";

/**
 * Typed errors for the API surface.
 *
 * Two audiences, always kept apart:
 *
 *   - `message` is shown to the founder. It says what happened and what to do.
 *   - `detail` is written to `submission_events` and the server log. It names
 *     hosts, IPs, selectors, status codes - whatever the next person needs to
 *     debug this from the dashboard without reproducing it.
 *
 * Nothing in this codebase catches an error and drops it. If a `catch` block
 * cannot handle a failure it re-throws or records it; an empty catch is a bug.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  /** Operator-facing context. Never rendered to the user. */
  readonly detail: string;
  readonly meta: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      status?: number;
      detail?: string;
      meta?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status ?? 500;
    this.detail = options.detail ?? message;
    this.meta = options.meta ?? {};
    // Keeps `instanceof` working once this is transpiled.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, meta: Record<string, unknown> = {}) {
    super(message, { code: "validation_failed", status: 400, meta });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in to continue.") {
    super(message, { code: "unauthorized", status: 401 });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found.`, {
      code: "not_found",
      status: 404,
      detail: `${resource} ${id} is not visible to this user (missing row, or RLS denied it).`,
      meta: { resource, id },
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, detail: string, meta: Record<string, unknown> = {}) {
    super(message, { code: "conflict", status: 409, detail, meta });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, detail: string) {
    super(
      `Too many launches. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
      { code: "rate_limited", status: 429, detail, meta: { retryAfterSeconds } },
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A Supabase/PostgREST failure we could not translate into something better. */
export class DatabaseError extends AppError {
  constructor(operation: string, detail: string, meta: Record<string, unknown> = {}) {
    super("Something went wrong on our side. Nothing was charged and nothing was submitted.", {
      code: "database_error",
      status: 500,
      detail: `${operation}: ${detail}`,
      meta: { operation, ...meta },
    });
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    meta?: Record<string, unknown>;
  };
}

/**
 * Turn any thrown value into a response.
 *
 * Unknown throwables become a generic 500 with the real reason logged, never
 * echoed - an SSRF guard message naming an internal IP would itself be an
 * information leak if returned verbatim on an unexpected path.
 */
export function toErrorResponse(error: unknown, context: string): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    // 5xx means we broke; log it. 4xx means the caller did, which is not an incident.
    const log = error.status >= 500 ? console.error : console.warn;
    log(`[${context}] ${error.code}: ${error.detail}`, error.meta);

    const headers = new Headers();
    if (error instanceof RateLimitError) headers.set("retry-after", String(error.retryAfterSeconds));

    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(Object.keys(error.meta).length > 0 ? { meta: error.meta } : {}),
        },
      },
      { status: error.status, headers },
    );
  }

  console.error(`[${context}] unhandled:`, error);
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong on our side. Nothing was submitted.",
      },
    },
    { status: 500 },
  );
}

/** Compact, log-safe rendering of an unknown throwable. */
export function describeError(error: unknown): string {
  if (error instanceof AppError) return `${error.code}: ${error.detail}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `non-error thrown: ${String(error)}`;
}
