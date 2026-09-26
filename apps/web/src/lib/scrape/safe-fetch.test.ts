import { describe, expect, it, vi } from "vitest";
import { safeFetch, type SafeFetchDeps } from "./safe-fetch";
import { ScrapeError } from "./errors";

const UA = "DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)";

/** A DNS stub. Anything not listed resolves to a benign public address. */
function lookupStub(map: Record<string, string[]>) {
  return vi.fn(async (hostname: string) => {
    const hit = map[hostname];
    if (hit) return hit;
    return ["93.184.216.34"];
  });
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirectTo(location: string, status = 302): Response {
  // `Response.redirect` refuses relative URLs and sets an immutable header list,
  // so build it by hand.
  return new Response(null, { status, headers: { location } });
}

function deps(overrides: Partial<SafeFetchDeps> = {}): SafeFetchDeps {
  return {
    lookup: lookupStub({}),
    fetchImpl: vi.fn(async () => html("<html><head><title>ok</title></head></html>")),
    ...overrides,
  };
}

const opts = { userAgent: UA };

async function expectBlocked(promise: Promise<unknown>, codeFragment: string) {
  await expect(promise).rejects.toBeInstanceOf(ScrapeError);
  await promise.catch((error: unknown) => {
    expect(error).toBeInstanceOf(ScrapeError);
    expect((error as ScrapeError).code).toContain(codeFragment);
  });
}

describe("safeFetch - scheme allowlist", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com:70/_x",
    "data:text/html,<h1>hi</h1>",
    "javascript:alert(1)",
    "http+unix://%2Fvar%2Frun%2Fdocker.sock/",
  ]) {
    it(`refuses ${url}`, async () => {
      const d = deps();
      await expectBlocked(safeFetch(url, opts, d), "unsupported_scheme");
      expect(d.fetchImpl).not.toHaveBeenCalled();
    });
  }

  it("refuses a URL that is not a URL at all", async () => {
    await expectBlocked(safeFetch("not a url", opts, deps()), "invalid_url");
  });

  it("refuses embedded credentials, which are only ever used to confuse a parser", async () => {
    await expectBlocked(safeFetch("https://user:pass@example.com/", opts, deps()), "invalid_url");
  });
});

describe("safeFetch - DNS is resolved before the IP check, not after", () => {
  it("blocks a public-looking hostname whose A record is the cloud metadata endpoint", async () => {
    // This is the actual attack. Every string-based check passes this URL.
    const d = deps({ lookup: lookupStub({ "metadata.attacker.example": ["169.254.169.254"] }) });

    await expectBlocked(safeFetch("https://metadata.attacker.example/latest/meta-data/", opts, d), "blocked_address");
    expect(d.lookup).toHaveBeenCalledWith("metadata.attacker.example");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a hostname resolving into RFC1918", async () => {
    const d = deps({ lookup: lookupStub({ "internal.attacker.example": ["10.0.0.5"] }) });
    await expectBlocked(safeFetch("https://internal.attacker.example/", opts, d), "blocked_address");
  });

  it("blocks when ANY record is private, not just the first", async () => {
    // Multi-record DNS rebinding: the resolver may hand a different record to
    // the socket than the one we validated, so a single bad record poisons the
    // whole name.
    const d = deps({ lookup: lookupStub({ "rebind.attacker.example": ["93.184.216.34", "127.0.0.1"] }) });
    await expectBlocked(safeFetch("https://rebind.attacker.example/", opts, d), "blocked_address");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks decimal, hex and octal IPv4 shorthand for loopback", async () => {
    // WHATWG URL normalises all of these to 127.0.0.1 before we see them, so
    // they arrive as literals and are judged directly - never handed to a
    // resolver, whose answer we would then be trusting.
    const d = deps();
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://127.1/"]) {
      await expectBlocked(safeFetch(url, opts, d), "blocked_address");
    }
    expect(d.lookup).not.toHaveBeenCalled();
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a bracketed IPv6 loopback literal without consulting DNS", async () => {
    const d = deps();
    await expectBlocked(safeFetch("http://[::1]:8080/", opts, d), "blocked_address");
    expect(d.lookup).not.toHaveBeenCalled();
  });

  it("blocks an IPv4-mapped IPv6 literal pointing at the metadata endpoint", async () => {
    const d = deps();
    await expectBlocked(safeFetch("http://[::ffff:169.254.169.254]/", opts, d), "blocked_address");
  });

  it("treats an unresolvable hostname as a failure, not as permission to proceed", async () => {
    const d = deps({
      lookup: vi.fn(async () => {
        throw Object.assign(new Error("getaddrinfo ENOTFOUND nope.example"), { code: "ENOTFOUND" });
      }),
    });
    await expectBlocked(safeFetch("https://nope.example/", opts, d), "dns_failure");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("allows an ordinary public host", async () => {
    const d = deps();
    const result = await safeFetch("https://example.com/", opts, d);
    expect(result.status).toBe(200);
    expect(result.body).toContain("<title>ok</title>");
  });
});

describe("safeFetch - every redirect hop is re-validated", () => {
  it("blocks a redirect from a public host into a private range", async () => {
    // The classic bypass: hop 1 is genuinely example.com, hop 2 is 127.0.0.1.
    const d = deps({
      lookup: lookupStub({ "example.com": ["93.184.216.34"], "127.0.0.1": ["127.0.0.1"] }),
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://example.com/") return redirectTo("http://127.0.0.1:9200/_cluster/health");
        return html("<html>internal</html>");
      }),
    });

    await expectBlocked(safeFetch("https://example.com/", opts, d), "blocked_address");
    // Crucially: we never issued the second request.
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect into the metadata endpoint via a rebinding hostname", async () => {
    const d = deps({
      lookup: lookupStub({
        "example.com": ["93.184.216.34"],
        "second.attacker.example": ["169.254.169.254"],
      }),
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "https://example.com/") {
          return redirectTo("https://second.attacker.example/latest/meta-data/iam/");
        }
        return html("<html>secrets</html>");
      }),
    });

    await expectBlocked(safeFetch("https://example.com/", opts, d), "blocked_address");
    expect(d.lookup).toHaveBeenCalledWith("second.attacker.example");
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect that changes scheme to something non-http", async () => {
    const d = deps({
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "https://example.com/") return redirectTo("file:///etc/passwd");
        return html("<html/>");
      }),
    });
    await expectBlocked(safeFetch("https://example.com/", opts, d), "unsupported_scheme");
  });

  it("follows up to 3 redirects and returns the final document", async () => {
    const chain: Record<string, string> = {
      "https://example.com/": "https://example.com/a",
      "https://example.com/a": "https://example.com/b",
      "https://example.com/b": "https://example.com/c",
    };
    const d = deps({
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const next = chain[String(input)];
        if (next) return redirectTo(next);
        return html("<html><head><title>final</title></head></html>");
      }),
    });

    const result = await safeFetch("https://example.com/", opts, d);
    expect(result.url).toBe("https://example.com/c");
    expect(result.body).toContain("final");
    expect(d.fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("gives up on the 4th redirect rather than following a loop", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => redirectTo("https://example.com/next")) });
    await expectBlocked(safeFetch("https://example.com/", opts, d), "too_many_redirects");
    // 1 original + 3 permitted follows, then stop.
    expect(d.fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("never lets fetch follow redirects on our behalf", async () => {
    const fetchImpl = vi.fn(async () => html("<html/>"));
    await safeFetch("https://example.com/", opts, deps({ fetchImpl }));
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    // If this were "follow", the intermediate hops would never reach our guard.
    expect(init.redirect).toBe("manual");
  });

  it("resolves relative Location headers against the hop they came from", async () => {
    const d = deps({
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "https://example.com/deep/page") return redirectTo("/landed");
        return html("<html><head><title>landed</title></head></html>");
      }),
    });
    const result = await safeFetch("https://example.com/deep/page", opts, d);
    expect(result.url).toBe("https://example.com/landed");
  });
});

describe("safeFetch - resource caps", () => {
  it("refuses a declared Content-Length over the cap without reading the body", async () => {
    const d = deps({
      fetchImpl: vi.fn(
        async () =>
          new Response("x", {
            status: 200,
            headers: { "content-type": "text/html", "content-length": String(50 * 1024 * 1024) },
          }),
      ),
    });
    await expectBlocked(safeFetch("https://example.com/", { ...opts, maxBytes: 2 * 1024 * 1024 }, d), "response_too_large");
  });

  it("stops reading a lying or chunked body once it passes the cap", async () => {
    // No Content-Length at all - the only defence is counting bytes as they arrive.
    let produced = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1024;
        if (produced > 10 * 1024 * 1024) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const d = deps({
      fetchImpl: vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "text/html" } })),
    });

    await expectBlocked(safeFetch("https://example.com/", { ...opts, maxBytes: 64 * 1024 }, d), "response_too_large");
    // We bailed out early rather than buffering the whole 10MB.
    expect(produced).toBeLessThan(1 * 1024 * 1024);
  });

  it("gives up on a hanging response instead of holding the request handler open", async () => {
    const d = deps({
      fetchImpl: vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      }),
    });

    await expectBlocked(safeFetch("https://example.com/", { ...opts, timeoutMs: 40 }, d), "timeout");
  });

  it("applies one timeout budget across the whole redirect chain", async () => {
    const d = deps({
      fetchImpl: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        await new Promise((r) => setTimeout(r, 30));
        if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        return redirectTo(`${String(input)}x`);
      }),
    });
    // 3 hops at 30ms each exceeds an 45ms total budget, so the chain - not any
    // single request - is what runs out of time.
    await expectBlocked(safeFetch("https://example.com/", { ...opts, timeoutMs: 45 }, d), "timeout");
  });
});

describe("safeFetch - politeness", () => {
  it("identifies itself honestly and does not impersonate a browser", async () => {
    const fetchImpl = vi.fn(async () => html("<html/>"));
    await safeFetch("https://example.com/", opts, deps({ fetchImpl }));

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toBe(UA);
    expect(headers.get("user-agent")).not.toMatch(/Mozilla|Chrome|Safari|AppleWebKit/i);
  });

  it("does not send cookies or credentials to third-party sites", async () => {
    const fetchImpl = vi.fn(async () => html("<html/>"));
    await safeFetch("https://example.com/", opts, deps({ fetchImpl }));
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe("omit");
  });
});
