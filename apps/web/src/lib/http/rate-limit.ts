/**
 * Sliding-window rate limiting for endpoints that spend our resources.
 *
 * `POST /api/apps` makes our infrastructure fetch a URL chosen by the caller and
 * then fans out 23 database rows. Both halves are worth abusing, so the limit is
 * per authenticated user rather than per IP - the user id is the thing we
 * actually trust, and it survives a proxy.
 *
 * SCOPE, stated plainly: this is process-local memory. On a single Railway
 * instance it is a real limit. Scale `web` past one replica and it becomes a
 * per-replica limit, at which point the counter belongs in Postgres or Redis.
 * The interface below does not change when that happens.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window after this one. */
  remaining: number;
  /** Seconds until the window frees a slot. 0 when allowed. */
  retryAfterSeconds: number;
  /**
   * Hand back the slot this call consumed.
   *
   * Used when the request turns out to be a no-op - a duplicate submission, or
   * a validation failure caught before any network or database work. Charging a
   * founder's budget for a request that did nothing would be a bug.
   */
  release: () => void;
}

export interface RateLimiter {
  check: (key: string) => RateLimitDecision;
  /** Read the current verdict without consuming a slot. */
  peek: (key: string) => Omit<RateLimitDecision, "release">;
  size: () => number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

const NOOP = () => undefined;

export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): RateLimiter {
  /** key -> timestamps of the hits still inside the window, oldest first. */
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  function prune(timestamps: number[], cutoff: number): number[] {
    // Timestamps are appended in order, so the survivors are always a suffix.
    let i = 0;
    while (i < timestamps.length && (timestamps[i] as number) <= cutoff) i += 1;
    return i === 0 ? timestamps : timestamps.slice(i);
  }

  /**
   * Drop keys whose entire history has aged out. Without this the map is an
   * unbounded leak keyed by user id - slow, but a leak.
   */
  function sweep(current: number): void {
    if (current - lastSweep < windowMs) return;
    lastSweep = current;
    const cutoff = current - windowMs;
    for (const [key, timestamps] of hits) {
      const live = prune(timestamps, cutoff);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }

  function evaluate(key: string, consume: boolean): RateLimitDecision {
    const current = now();
    sweep(current);

    const cutoff = current - windowMs;
    const live = prune(hits.get(key) ?? [], cutoff);

    if (live.length >= limit) {
      if (live.length > 0) hits.set(key, live);
      const oldest = live[0] as number;
      const waitMs = Math.max(0, oldest + windowMs - current);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
        release: NOOP,
      };
    }

    if (!consume) {
      if (live.length > 0) hits.set(key, live);
      return { allowed: true, remaining: limit - live.length, retryAfterSeconds: 0, release: NOOP };
    }

    const stamp = current;
    const updated = [...live, stamp];
    hits.set(key, updated);

    let released = false;
    return {
      allowed: true,
      remaining: limit - updated.length,
      retryAfterSeconds: 0,
      release: () => {
        if (released) return;
        released = true;
        const currentHits = hits.get(key);
        if (!currentHits) return;
        const index = currentHits.lastIndexOf(stamp);
        if (index === -1) return;
        const next = [...currentHits.slice(0, index), ...currentHits.slice(index + 1)];
        if (next.length === 0) hits.delete(key);
        else hits.set(key, next);
      },
    };
  }

  return {
    check: (key) => evaluate(key, true),
    peek: (key) => {
      const { allowed, remaining, retryAfterSeconds } = evaluate(key, false);
      return { allowed, remaining, retryAfterSeconds };
    },
    size: () => hits.size,
  };
}

/**
 * The launch limiter.
 *
 * A founder launching one app triggers one outbound fetch and 23 rows. Five per
 * hour is generous for the legitimate case (submit, notice a typo in the URL,
 * resubmit) and useless as an amplification primitive.
 */
export const launchRateLimiter = createRateLimiter({
  limit: Number(process.env.LAUNCH_RATE_LIMIT ?? 5),
  windowMs: Number(process.env.LAUNCH_RATE_WINDOW_MS ?? 60 * 60 * 1000),
});
