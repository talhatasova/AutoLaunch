import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit then refuses", () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.check("user-a").allowed).toBe(true);
    expect(limiter.check("user-a").allowed).toBe(true);
    expect(limiter.check("user-a").allowed).toBe(true);

    const fourth = limiter.check("user-a");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are independent, so one noisy founder cannot block another", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });
    expect(limiter.check("user-a").allowed).toBe(true);
    expect(limiter.check("user-a").allowed).toBe(false);
    expect(limiter.check("user-b").allowed).toBe(true);
  });

  it("is a sliding window, not a fixed bucket that resets on the minute", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });

    limiter.check("u"); // t=0
    now = 600;
    limiter.check("u"); // t=600
    now = 900;
    expect(limiter.check("u").allowed).toBe(false); // both still in window

    now = 1_050; // the t=0 hit has aged out, the t=600 one has not
    expect(limiter.check("u").allowed).toBe(true);
    expect(limiter.check("u").allowed).toBe(false);
  });

  it("reports how long to wait based on the oldest hit in the window", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => now });
    limiter.check("u");
    now = 4_000;
    const denied = limiter.check("u");
    expect(denied.allowed).toBe(false);
    // Oldest hit at t=0 leaves the 10s window at t=10000, i.e. 6s from now.
    expect(denied.retryAfterSeconds).toBe(6);
  });

  it("reports remaining budget so a caller can surface it in a header", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(limiter.check("u").remaining).toBe(2);
    expect(limiter.check("u").remaining).toBe(1);
    expect(limiter.check("u").remaining).toBe(0);
    expect(limiter.check("u").remaining).toBe(0);
  });

  it("does not consume budget when only peeking", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });
    expect(limiter.peek("u").allowed).toBe(true);
    expect(limiter.peek("u").allowed).toBe(true);
    expect(limiter.check("u").allowed).toBe(true);
    expect(limiter.peek("u").allowed).toBe(false);
  });

  it("forgets idle keys so the map cannot grow without bound", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    for (let i = 0; i < 500; i += 1) {
      now = i * 10;
      limiter.check(`user-${i}`);
    }
    // Every entry from the first half of the run is now older than the window.
    now = 10_000;
    limiter.check("trigger-sweep");
    expect(limiter.size()).toBeLessThan(200);
  });

  it("releases a consumed slot when the caller could not complete the work", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });
    const first = limiter.check("u");
    expect(first.allowed).toBe(true);
    // The request failed before doing anything expensive, so it should not
    // count against the founder's budget.
    first.release();
    expect(limiter.check("u").allowed).toBe(true);
  });
});
