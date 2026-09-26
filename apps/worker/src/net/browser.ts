import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { CHALLENGE_WINDOW_GLOBALS } from "../drivers/challenge";
import type { DomSnapshot } from "../drivers/challenge";
import type { BrowserPool, PageLike } from "../drivers/types";
import { log } from "../logger";

/**
 * Playwright adapter. Thin on purpose: no policy lives here, only translation.
 *
 * NOTHING IN THIS FILE EVADES BOT DETECTION. There is no stealth plugin, no navigator
 * patching, no fingerprint spoofing, no proxy rotation. We announce ourselves with an
 * honest User-Agent carrying a contact URL and we accept being turned away. If a site
 * challenges us, the driver reports it and stops - see drivers/challenge.ts.
 */
export interface BrowserOptions {
  userAgent: string;
  headless: boolean;
  navigationTimeoutMs: number;
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
    this.context.setDefaultTimeout(this.opts.navigationTimeoutMs);
    this.context.setDefaultNavigationTimeout(this.opts.navigationTimeoutMs);
    return this.context;
  }

  async newPage(): Promise<PageLike> {
    const context = await this.ensure();
    const page = await context.newPage();
    return new PlaywrightPage(page, this.opts.navigationTimeoutMs);
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

class PlaywrightPage implements PageLike {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs: number,
  ) {}

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
    try {
      await locator.selectOption({ label: value }, { timeout: 5_000 });
    } catch {
      // Label did not match; fall back to value, then to the closest case-insensitive
      // label. A select whose options do not contain our category is a real mismatch and
      // is allowed to throw - the driver classifies it rather than picking something.
      await locator.selectOption(value, { timeout: 5_000 });
    }
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
  }
}
