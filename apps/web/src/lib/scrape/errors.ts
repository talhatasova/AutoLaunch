import { AppError } from "@/lib/http/errors";

/**
 * Failures on the outbound scrape path.
 *
 * These are 400-class on purpose: the user handed us a URL we will not or
 * cannot fetch. It is their input that is wrong, not our server. The `detail`
 * carries the resolved IP or the redirect chain so the event log is actually
 * useful; `message` never does, because a blocked-address reason names internal
 * infrastructure.
 */
export class ScrapeError extends AppError {
  constructor(
    message: string,
    options: { code: string; status?: number; detail: string; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { ...options, status: options.status ?? 400 });
  }
}

export function invalidUrl(detail: string, meta: Record<string, unknown> = {}): ScrapeError {
  return new ScrapeError("That does not look like a valid website address.", {
    code: "invalid_url",
    detail,
    meta,
  });
}

export function unsupportedScheme(scheme: string, url: string): ScrapeError {
  return new ScrapeError("We can only fetch http:// and https:// addresses.", {
    code: "unsupported_scheme",
    detail: `refused scheme ${JSON.stringify(scheme)} for ${url}`,
    meta: { scheme },
  });
}

/**
 * The SSRF guard fired. The user-facing message is deliberately vague; the
 * detail names the hostname and the resolved IP so an operator can tell an
 * attack from a founder whose staging box is on a VPN.
 */
export function blockedAddress(hostname: string, address: string, reason: string, hop: number): ScrapeError {
  return new ScrapeError("That address resolves to a private network, so we will not fetch it.", {
    code: "blocked_address",
    detail: `hop ${hop}: ${hostname} resolved to ${address}, which is in the ${reason}`,
    meta: { hostname, hop },
  });
}

export function dnsFailure(hostname: string, cause: unknown): ScrapeError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new ScrapeError("We could not find that domain. Check the spelling and try again.", {
    code: "dns_failure",
    detail: `DNS lookup failed for ${hostname}: ${reason}`,
    meta: { hostname },
    cause,
  });
}

export function tooManyRedirects(chain: string[], max: number): ScrapeError {
  return new ScrapeError("That address redirected too many times.", {
    code: "too_many_redirects",
    detail: `exceeded ${max} redirects: ${chain.join(" -> ")}`,
    meta: { redirects: chain.length - 1 },
  });
}

export function responseTooLarge(url: string, limitBytes: number, seenBytes: number | null): ScrapeError {
  return new ScrapeError("That page is too large for us to read.", {
    code: "response_too_large",
    detail:
      seenBytes === null
        ? `${url} declared a body over the ${limitBytes} byte cap`
        : `${url} exceeded the ${limitBytes} byte cap after ${seenBytes} bytes`,
    meta: { limitBytes },
  });
}

export function fetchTimeout(url: string, timeoutMs: number): ScrapeError {
  return new ScrapeError("That site took too long to respond.", {
    code: "timeout",
    detail: `${url} did not complete within ${timeoutMs}ms (budget covers the whole redirect chain)`,
    meta: { timeoutMs },
  });
}

export function upstreamFailure(url: string, cause: unknown): ScrapeError {
  const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return new ScrapeError("We could not reach that site.", {
    code: "upstream_unreachable",
    detail: `request to ${url} failed: ${reason}`,
    cause,
  });
}

export function robotsDisallowed(url: string, userAgent: string): ScrapeError {
  return new ScrapeError(
    "That site's robots.txt asks us not to fetch this page, so we have not.",
    {
      code: "robots_disallowed",
      status: 422,
      detail: `robots.txt at ${new URL(url).origin} disallows ${new URL(url).pathname} for ${userAgent}`,
      meta: { url },
    },
  );
}
