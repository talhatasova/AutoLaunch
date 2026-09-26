/**
 * Per-domain rate limiting.
 *
 * We are a guest on these sites. Concurrency across the worker is fine, but two jobs must
 * never hit the same host at once, and consecutive requests to one host are spaced by at
 * least `minIntervalMs`.
 *
 * Implemented as a promise chain per host: each caller awaits the previous caller for that
 * host, so ordering is preserved and there is no busy-wait.
 */
export class DomainRateLimiter {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly lastRequestAt = new Map<string, number>();

  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly now: () => number = () => Date.now(),
  ) {}

  static hostOf(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      // An unparseable URL still gets a bucket rather than an unlimited fast path.
      return url.toLowerCase();
    }
  }

  /** Runs `fn` with the host's slot held. Errors propagate; the slot is always released. */
  async run<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const host = DomainRateLimiter.hostOf(url);
    const previous = this.chains.get(host) ?? Promise.resolve();

    let release: () => void = () => undefined;
    const slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The chain must not reject, or every later caller for this host inherits the failure.
    this.chains.set(host, previous.then(() => slot).catch(() => undefined));

    await previous.catch(() => undefined);

    const last = this.lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = this.minIntervalMs - (this.now() - last);
      if (wait > 0) await this.sleep(wait);
    }

    try {
      this.lastRequestAt.set(host, this.now());
      return await fn();
    } finally {
      this.lastRequestAt.set(host, this.now());
      release();
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
