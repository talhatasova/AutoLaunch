import { describe, expect, it } from "vitest";
import { detectChallenge, emptySnapshot } from "../drivers/challenge";

/**
 * The load-bearing test in this repository.
 *
 * If detection is wrong in the permissive direction we either try to defeat a challenge
 * (which we refuse to do) or fill a form that will silently discard the submission.
 */
describe("detectChallenge", () => {
  it("passes a genuinely clean form page", () => {
    const clean = emptySnapshot({
      url: "https://startupproject.org/submit-startup/",
      html: `<html><body><form><input id="companyName"><input id="fax_number" style="display:none"><button type="submit">Submit</button></form></body></html>`,
      scriptSrcs: ["/_next/static/chunks/0apch4zqlywp9.js"],
      frameUrls: ["https://startupproject.org/submit-startup/"],
      windowKeys: [],
    });
    expect(detectChallenge(clean)).toBeNull();
  });

  describe("client-side injection (the Future Tools case)", () => {
    // Research found Future Tools serving a clean, CAPTCHA-free form to curl and then
    // injecting Turnstile once the page rendered. A detector reading the server's initial
    // HTML would call this page safe and ship a driver that fails silently on exactly the
    // site it most needs to catch.
    const initialServerHtml = `<html><body><form id="submit-tool"><input name="tool_name"><button type="submit">Submit</button></form><script src="/app.js"></script></body></html>`;

    const liveDomAfterRender = `<html><body><form id="submit-tool"><input name="tool_name">` +
      `<div class="cf-turnstile" data-sitekey="0x4AAA"></div>` +
      `<input type="hidden" name="cf-turnstile-response">` +
      `<button type="submit">Submit</button></form>` +
      `<script src="/app.js"></script>` +
      `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>`;

    it("finds nothing in the initial server HTML - which is why we never look there", () => {
      const staticOnly = emptySnapshot({
        url: "https://www.futuretools.io/submit-a-tool",
        html: initialServerHtml,
        scriptSrcs: ["/app.js"],
      });
      // Documents the trap rather than endorsing it: this is the exact false negative a
      // static check produces.
      expect(detectChallenge(staticOnly)).toBeNull();
    });

    it("detects Turnstile in the LIVE DOM captured after render", () => {
      const live = emptySnapshot({
        url: "https://www.futuretools.io/submit-a-tool",
        html: liveDomAfterRender,
        scriptSrcs: ["/app.js", "https://challenges.cloudflare.com/turnstile/v0/api.js"],
        frameUrls: [
          "https://www.futuretools.io/submit-a-tool",
          "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0",
        ],
        windowKeys: ["turnstile"],
      });
      const finding = detectChallenge(live);
      expect(finding?.kind).toBe("cloudflare_turnstile");
      expect(finding?.evidence).toContain("challenges.cloudflare.com");
    });

    it("detects a widget visible ONLY as a window global", () => {
      // Some widgets render into a shadow root, so the serialised HTML is clean while the
      // vendor script has plainly executed.
      const live = emptySnapshot({
        url: "https://example.test/submit",
        html: "<html><body><form></form></body></html>",
        windowKeys: ["turnstile"],
      });
      expect(detectChallenge(live)?.kind).toBe("cloudflare_turnstile");
    });

    it("detects a widget visible ONLY as a cross-origin iframe", () => {
      const live = emptySnapshot({
        url: "https://example.test/submit",
        html: "<html><body><form></form></body></html>",
        frameUrls: ["https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html"],
      });
      expect(detectChallenge(live)?.kind).toBe("hcaptcha");
    });
  });

  it("detects a Cloudflare interstitial", () => {
    const finding = detectChallenge(
      emptySnapshot({
        url: "https://www.producthunt.com/posts/new",
        status: 503,
        html: `<html><head><title>Just a moment...</title></head><body><div id="challenge-running"></div><script>window._cf_chl_opt={};</script></body></html>`,
        windowKeys: ["_cf_chl_opt"],
      }),
    );
    expect(finding?.kind).toBe("cloudflare_interstitial");
  });

  it("detects reCAPTCHA", () => {
    const finding = detectChallenge(
      emptySnapshot({
        url: "https://example.test/submit",
        html: `<form><div class="g-recaptcha" data-sitekey="abc"></div></form>`,
        scriptSrcs: ["https://www.google.com/recaptcha/api.js"],
        windowKeys: ["grecaptcha"],
      }),
    );
    expect(finding?.kind).toBe("recaptcha");
  });

  it("detects hCaptcha", () => {
    const finding = detectChallenge(
      emptySnapshot({
        url: "https://example.test/submit",
        html: `<form><div class="h-captcha" data-sitekey="abc"></div></form>`,
        scriptSrcs: ["https://js.hcaptcha.com/1/api.js"],
      }),
    );
    expect(finding?.kind).toBe("hcaptcha");
  });

  it("stops on a CAPTCHA vendor it has never seen", () => {
    // The one mistake we refuse is guessing "probably fine" about an uncatalogued vendor.
    const finding = detectChallenge(
      emptySnapshot({
        url: "https://example.test/submit",
        html: `<form><div class="frc-captcha" data-sitekey="x"></div></form>`,
      }),
    );
    expect(finding?.kind).toBe("generic_captcha");
  });

  it("always explains itself in words the user can read", () => {
    const finding = detectChallenge(
      emptySnapshot({ url: "https://example.test/s", windowKeys: ["grecaptcha"] }),
    );
    expect(finding?.detail).toMatch(/do not solve or evade/i);
  });
});
