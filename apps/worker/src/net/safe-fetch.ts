import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Worker-side GET for third-party pages (listing lookups). Same controls as
 * apps/web/src/lib/scrape/safe-fetch.ts: http(s) only, no URL credentials, every resolved
 * address must be public, redirects followed manually with each hop re-checked, a byte
 * cap enforced while streaming, and one timeout for the whole chain.
 *
 * ponytail: DNS-rebinding window between lookup and connect is not closed; pin the socket
 * with an undici dispatcher if listing lookups ever take founder-typed hosts unguarded.
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPublicAddress(mapped);
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  return !blocked.check(address, family);
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Refusing ${url.protocol} URL`);
  if (url.username || url.password) throw new Error("Refusing URL with embedded credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Error(`Refusing non-public address for ${host}`);
  }
}

export interface SafeFetchResult { url: string; status: number; body: string }

export async function safeFetch(
  rawUrl: string,
  opts: { userAgent: string; maxBytes?: number; timeoutMs?: number; maxRedirects?: number },
): Promise<SafeFetchResult> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "user-agent": opts.userAgent, accept: "text/html,application/xhtml+xml" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    try {
      for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
        total += r.value.byteLength;
        if (total > maxBytes) throw new Error(`Response from ${current.host} exceeds ${maxBytes} bytes`);
        chunks.push(r.value);
      }
    } finally {
      await reader?.cancel().catch(() => undefined); // stop an oversized body streaming in
    }
    return { url: current.toString(), status: res.status, body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error(`Too many redirects from ${rawUrl}`);
}
