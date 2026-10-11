import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { CHALLENGE_WINDOW_GLOBALS } from "../drivers/challenge";
import type { DomSnapshot } from "../drivers/challenge";
import type { BrowserPool, PageLike } from "../drivers/types";
import { ManualRequiredError } from "../errors";
import { log } from "../logger";
import { isPublicAddress } from "./safe-fetch";

/**
 * Playwright adapter. Thin on purpose: no policy lives here, only translation.
 *
 * NOTHING IN THIS FILE EVADES BOT DETECTION. There is no stealth plugin, no navigator
 * patching, no fingerprint spoofing, no proxy rotation. We announce ourselves with an
 * honest User-Agent carrying a contact URL. A detected challenge stops the job
 * (needs_manual) - see drivers/challenge.ts.
 */
export interface BrowserOptions {
  userAgent: string;
  headless: boolean;
  navigationTimeoutMs: number;
}

/**
 * Network guard for every context: pages are untrusted, so any request (including redirects
 * and subresources) to a non-public address is aborted. Lookups are cached for 30s per host.
 * ponytail: DNS-rebinding window between this lookup and Chromium's connect remains; pin via
 * a proxy if directories ever become adversarial.
 */
const hostVerdicts = new Map<string, { ok: boolean; at: number }>();
async function hostIsPublic(host: string): Promise<boolean> {
  const cached = hostVerdicts.get(host);
  if (cached && Date.now() - cached.at < 30_000) return cached.ok;
  let ok = false;
  try {
    const bare = host.replace(/^\[|\]$/g, "");
    const addrs = isIP(bare) ? [bare] : (await lookup(bare, { all: true, verbatim: true })).map((r) => r.address);
    ok = addrs.length > 0 && addrs.every(isPublicAddress);
  } catch { /* unresolvable: abort */ }
  hostVerdicts.set(host, { ok, at: Date.now() });
  return ok;
}

async function guardContext(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || url.protocol === "blob:") {
      return route.request().isNavigationRequest() ? route.abort("blockedbyclient") : route.continue();
    }
    if ((url.protocol === "http:" || url.protocol === "https:") && (await hostIsPublic(url.hostname))) {
      return route.continue();
    }
    log.warn("blocked browser request", { host: url.hostname, protocol: url.protocol });
    return route.abort("blockedbyclient");
  });
}

export class PlaywrightPool implements BrowserPool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly opts: BrowserOptions) {}

  private async ensure(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.browser = await chromium.launch({ headless: this.opts.headless });
    this.context = await this.browser.newContext({
      userAgent: this.opts.userAgent,
      // Deliberately plain. Anything beyond an honest UA starts to be evasion.
      extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
    });
    await guardContext(this.context);
    this.context.setDefaultTimeout(this.opts.navigationTimeoutMs);
    this.context.setDefaultNavigationTimeout(this.opts.navigationTimeoutMs);
    return this.context;
  }

  async newPage(): Promise<SessionPage> {
    const context = await this.ensure();
    const page = await context.newPage();
    return new PlaywrightPage(page, this.opts.navigationTimeoutMs);
  }

  /**
   * A page in its own context, optionally restored from a saved storageState. Used for
   * platform-account sessions so cookies never leak into the shared anonymous context.
   * Closing the page closes the context.
   */
  async newIsolatedPage(storageState?: unknown): Promise<SessionPage> {
    await this.ensure();
    const context = await this.browser!.newContext({
      userAgent: this.opts.userAgent,
      extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
      ...(storageState ? { storageState: storageState as BrowserContextOptions["storageState"] } : {}),
    });
    await guardContext(context);
    context.setDefaultTimeout(this.opts.navigationTimeoutMs);
    context.setDefaultNavigationTimeout(this.opts.navigationTimeoutMs);
    return new PlaywrightPage(await context.newPage(), this.opts.navigationTimeoutMs, context);
  }

  async shutdown(): Promise<void> {
    try {
      await this.context?.close();
      await this.browser?.close();
    } catch (e) {
      // Shutdown noise must be visible, but must not become the process's exit reason.
      log.warn("browser shutdown failed", { error: String(e) });
    } finally {
      this.context = null;
      this.browser = null;
    }
  }
}

export interface SessionPage extends PageLike {
  storageState(): Promise<unknown>;
  /** Raw Playwright page, for operator tooling (certify CLI screenshots). Drivers use PageLike. */
  readonly page: Page;
}

class PlaywrightPage implements SessionPage {
  constructor(
    readonly page: Page,
    private readonly timeoutMs: number,
    private readonly ownContext: BrowserContext | null = null,
  ) {}

  async storageState(): Promise<unknown> {
    return await this.page.context().storageState();
  }

  async goto(url: string): Promise<{ status: number | null }> {
    // domcontentloaded, then an explicit network settle: we need the LIVE DOM including
    // client-injected widgets, and "load" alone misses scripts that mount after it.
    const res = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: this.timeoutMs,
    });
    await this.page
      .waitForLoadState("networkidle", { timeout: Math.min(this.timeoutMs, 10_000) })
      .catch(() => undefined); // A chatty page that never idles is not an error.
    return { status: res ? res.status() : null };
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Captures the RENDERED page, not the server response.
   *
   * page.content() serialises the live DOM after scripts have run, and the frame list,
   * script srcs and window globals are all read from the running page. This is what makes
   * a client-side-injected Turnstile visible - a check against the initial HTML would not
   * see it.
   */
  async snapshot(): Promise<DomSnapshot> {
    const html = await this.page.content();
    const frameUrls = this.page.frames().map((f) => f.url());
    const probe = await this.page.evaluate((globals: readonly string[]) => {
      const scripts = Array.from(document.querySelectorAll("script"))
        .map((s: Element) => s.getAttribute("src") ?? "")
        .filter((s: string) => s.length > 0);
      const present = globals.filter(
        (g) => (window as unknown as Record<string, unknown>)[g] !== undefined,
      );
      return { scripts, present };
    }, CHALLENGE_WINDOW_GLOBALS as readonly string[]);

    return {
      url: this.page.url(),
      html,
      frameUrls,
      scriptSrcs: probe.scripts,
      windowKeys: probe.present,
      status: null,
    };
  }

  async exists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().fill(value, { timeout: this.timeoutMs });
  }

  async selectOption(selector: string, value: string): Promise<void> {
    const locator = this.page.locator(selector).first();
    const options = await locator.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, label: o.text.trim() })),
    );
    const pick = pickOption(options, value);
    if (!pick) {
      // No option fits: a category choice is the founder's to make, not ours to guess.
      throw new ManualRequiredError(`None of the choices at ${selector} fit "${value}", so this one needs you to pick.`);
    }
    await locator.selectOption({ value: pick.value }, { timeout: 5_000 });
  }

  async setChecked(selector: string, checked: boolean): Promise<void> {
    await this.page.locator(selector).first().setChecked(checked, { timeout: this.timeoutMs });
  }

  async readValue(selector: string): Promise<string> {
    const locator = this.page.locator(selector).first();
    return await locator.inputValue({ timeout: 5_000 });
  }

  async click(selector: string): Promise<void> {
    await this.page.locator(selector).first().click({ timeout: this.timeoutMs });
  }

  async visibleText(): Promise<string> {
    return (await this.page.locator("body").innerText({ timeout: 5_000 })) ?? "";
  }

  async settle(ms: number): Promise<void> {
    await this.page.waitForLoadState("networkidle", { timeout: ms }).catch(() => undefined);
    await this.page.waitForTimeout(Math.min(ms, 3_000));
  }

  async close(): Promise<void> {
    await this.page.close();
    await this.ownContext?.close();
  }
}

/**
 * Picks the <option> for a payload value: exact label/value (case-insensitive), then the
 * option sharing the most words with the value, then an "Other" option, else null.
 * ponytail: word-overlap heuristic; add a per-field option map to form_schema if it misfires.
 */
export function pickOption(
  options: Array<{ value: string; label: string }>,
  wanted: string,
): { value: string; label: string } | null {
  const real = options.filter((o) => o.value !== "");
  const w = wanted.trim().toLowerCase();
  const exact = real.find((o) => o.label.toLowerCase() === w || o.value.toLowerCase() === w);
  if (exact) return exact;
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const want = new Set(words(wanted));
  let best: { value: string; label: string } | null = null;
  let bestScore = 0;
  for (const o of real) {
    const score = words(o.label).filter((t) => want.has(t)).length;
    if (score > bestScore) [best, bestScore] = [o, score];
  }
  return best ?? real.find((o) => /^other$/i.test(o.label) || /^other$/i.test(o.value)) ?? null;
}
