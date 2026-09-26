import { lookup as dnsLookup } from "node:dns/promises";
import { classifyIp, isIpLiteral } from "./ip-guard";
import {
  blockedAddress,
  dnsFailure,
  fetchTimeout,
  invalidUrl,
  responseTooLarge,
  tooManyRedirects,
  unsupportedScheme,
  upstreamFailure,
} from "./errors";

/**
 * The only way this application is allowed to fetch a user-supplied URL.
 *
 * The threat: `POST /api/apps` takes an arbitrary URL and fetches it from
 * inside Railway's network, which can reach sibling services on 10.x, the
 * container's own loopback, and the cloud metadata endpoint. An unguarded
 * fetch here turns our server into the attacker's HTTP proxy onto our own
 * private network.
 *
 * Five controls, all of which have to hold:
 *
 *   1. http/https only. No file:, no gopher:, no data:.
 *   2. DNS is resolved BEFORE any connection, and the RESOLVED IP is what gets
 *      checked. Checking the hostname is the bug: `metadata.attacker.com` with
 *      an A record of 169.254.169.254 passes every string test.
 *   3. Redirects are followed manually and every hop repeats steps 1 and 2.
 *      `redirect: "follow"` would let hop 2 land on 127.0.0.1 unseen.
 *   4. A byte cap enforced while streaming, not from Content-Length, which a
 *      hostile server simply lies about.
 *   5. One timeout budget across the entire chain, so N slow hops cannot add up
 *      to an indefinitely held request handler.
 *
 * Residual risk, stated rather than hidden: between our `lookup()` and the
 * kernel's own resolution inside `fetch`, a hostile authoritative server with a
 * 0-second TTL can return a different address (classic DNS rebinding). We
 * narrow it by rejecting a name if ANY of its records is private, which defeats
 * the common multi-record variant. Fully closing it requires pinning the socket
 * to the validated IP via a custom `undici` dispatcher; that is the next
 * hardening step and belongs behind this same function signature.
 */

export interface SafeFetchDeps {
  /** Resolve a hostname to every address the OS would consider using. */
  lookup: (hostname: string) => Promise<string[]>;
  fetchImpl: typeof fetch;
}

export interface SafeFetchOptions {
  userAgent: string;
  accept?: string;
  /** Hard ceiling on redirect hops. */
  maxRedirects?: number;
  /** Hard ceiling on the response body, enforced while streaming. */
  maxBytes?: number;
  /** Budget for the WHOLE chain, not per request. */
  timeoutMs?: number;
}

export interface SafeFetchResult {
  /** The final URL after redirects - what the metadata should be attributed to. */
  url: string;
  status: number;
  headers: Headers;
  body: string;
  /** Every URL visited, oldest first. Written into submission_events on failure. */
  chain: string[];
}

export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 10_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const defaultDeps: SafeFetchDeps = {
  async lookup(hostname: string): Promise<string[]> {
    // `all: true` is the point: a name with several A records must be judged on
    // all of them, because we do not control which one the socket picks.
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.map((r) => r.address);
  },
  fetchImpl: globalThis.fetch,
};

/**
 * Parse and validate the scheme/shape of a URL without touching the network.
 * Exported because the API route validates the submitted URL before it decides
 * to spend a scrape on it.
 */
export function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw invalidUrl(`URL constructor rejected ${JSON.stringify(raw)}`, { cause: String(cause) });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw unsupportedScheme(url.protocol, raw);
  }

  // Credentials in a URL exist in this context only to confuse a parser or a
  // human reading a link. We have no use for them.
  if (url.username !== "" || url.password !== "") {
    throw invalidUrl("URL carries embedded credentials", { host: url.hostname });
  }

  if (url.hostname === "") {
    throw invalidUrl("URL has no hostname");
  }

  return url;
}

/**
 * Resolve `hostname` and refuse if ANY resolved address is non-public.
 * Returns the validated addresses so the caller can log what it approved.
 */
export async function assertPublicHostname(
  hostname: string,
  hop: number,
  deps: Pick<SafeFetchDeps, "lookup">,
): Promise<string[]> {
  // URL hostnames keep the brackets on IPv6 literals; DNS does not want them.
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");

  // An address that is already a literal is judged directly. Sending it through
  // a resolver would make the verdict depend on resolver behaviour for no gain.
  // This path is load-bearing: `new URL()` silently normalises IPv4 shorthand,
  // so `http://2130706433/` and `http://0x7f.1/` arrive here as `127.0.0.1`.
  if (isIpLiteral(bare)) {
    const verdict = classifyIp(bare);
    if (!verdict.allowed) throw blockedAddress(bare, bare, verdict.reason, hop);
    return [bare];
  }

  let addresses: string[];
  try {
    addresses = await deps.lookup(bare);
  } catch (cause) {
    throw dnsFailure(bare, cause);
  }

  if (addresses.length === 0) {
    throw dnsFailure(bare, new Error("resolver returned no addresses"));
  }

  for (const address of addresses) {
    const verdict = classifyIp(address);
    if (!verdict.allowed) {
      throw blockedAddress(bare, address, verdict.reason, hop);
    }
  }

  return addresses;
}

/**
 * Drain a response body, refusing to buffer more than `maxBytes`.
 *
 * Content-Length is treated as a hint that can save us the work, never as the
 * authority - a hostile server can omit it, understate it, or use chunked
 * encoding. The stream counter is the actual control.
 */
async function readCapped(response: Response, url: string, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      // Cancel so we do not leave the connection draining in the background.
      await response.body?.cancel().catch(() => undefined);
      throw responseTooLarge(url, maxBytes, null);
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw responseTooLarge(url, maxBytes, total);
      }
      chunks.push(value);
    }
  } finally {
    // Releasing the lock and cancelling is what actually stops an oversized
    // body from continuing to stream into our process after we bail.
    reader.releaseLock();
    await response.body.cancel().catch(() => undefined);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Charset detection beyond UTF-8 is not worth the dependency here; meta tags
  // in a non-UTF-8 document degrade to mojibake rather than to an exception.
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
  deps: SafeFetchDeps = defaultDeps,
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  // One budget for the whole chain. Three hops at 9s each is not "9 seconds".
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const chain: string[] = [];

  try {
    let current = parseHttpUrl(rawUrl);

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      await assertPublicHostname(current.hostname, hop, deps);
      chain.push(current.toString());

      let response: Response;
      try {
        response = await deps.fetchImpl(current.toString(), {
          method: "GET",
          // The whole guard depends on this. "follow" hands redirect handling to
          // the platform, and the platform does not consult our IP blocklist.
          redirect: "manual",
          // We are an anonymous public-web client. No cookies, no auth, ever.
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
          headers: {
            // Honest identification with a contact URL. We are a bot and we say so.
            "user-agent": options.userAgent,
            accept: options.accept ?? "text/html,application/xhtml+xml",
            "accept-language": "en",
          },
        });
      } catch (cause) {
        if (controller.signal.aborted) throw fetchTimeout(current.toString(), timeoutMs);
        throw upstreamFailure(current.toString(), cause);
      }

      if (!REDIRECT_STATUSES.has(response.status)) {
        const body = await readCapped(response, current.toString(), maxBytes);
        return {
          url: current.toString(),
          status: response.status,
          headers: response.headers,
          body,
          chain,
        };
      }

      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        // A redirect with nowhere to go. Treat the response as final rather than
        // inventing a destination.
        return {
          url: current.toString(),
          status: response.status,
          headers: response.headers,
          body: "",
          chain,
        };
      }

      let next: URL;
      try {
        // Relative Location headers are legal and common; resolve against the
        // hop that issued them, not against the original URL.
        next = new URL(location, current);
      } catch (cause) {
        throw invalidUrl(`redirect target ${JSON.stringify(location)} from ${current.toString()} is not a URL`, {
          cause: String(cause),
        });
      }

      // Re-run the scheme check: a redirect to file:// is a redirect to file://.
      current = parseHttpUrl(next.toString());
    }

    throw tooManyRedirects([...chain], maxRedirects);
  } finally {
    clearTimeout(timer);
  }
}
