/**
 * IP address classification for the SSRF guard.
 *
 * `POST /api/apps` fetches a URL the user typed, from inside Railway's private
 * network. Everything reachable on that network - the container's own loopback,
 * sibling services on 10.x, and the cloud metadata endpoint on 169.254.169.254 -
 * is one careless fetch away from being proxied to an attacker.
 *
 * This module makes exactly one decision: given an IP that DNS actually resolved
 * to, may we connect to it? It knows nothing about hostnames, because a hostname
 * check is the vulnerability - `metadata.attacker.com` with an A record of
 * 169.254.169.254 passes every string test anyone has ever written.
 *
 * Fail closed: anything this module cannot parse is blocked.
 */

export type IpVerdict = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: IpVerdict = { allowed: true };

function deny(reason: string): IpVerdict {
  return { allowed: false, reason };
}

/** Parse a dotted-quad into 4 octets. Strict: no octal, no decimal shorthand. */
function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (part.length === 0 || part.length > 3) return null;
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/**
 * Classify a dotted-quad IPv4 address.
 *
 * Ranges come from the IANA IPv4 Special-Purpose Address Registry rather than
 * the folk-memory list of "private" ranges, because the folk list omits CGNAT
 * (100.64/10) and 0.0.0.0/8 - both routable to infrastructure in a cloud
 * environment, and 0.0.0.0 is an alias for localhost on Linux.
 */
function classifyIpv4(octets: [number, number, number, number]): IpVerdict {
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  const d = octets[3];

  // 0.0.0.0/8 - "this network".
  if (a === 0) return deny("unspecified / this-network range 0.0.0.0/8");

  // 10.0.0.0/8 - RFC1918. Railway's internal service mesh.
  if (a === 10) return deny("private range 10.0.0.0/8 (RFC1918)");

  // 127.0.0.0/8 - loopback.
  if (a === 127) return deny("loopback range 127.0.0.0/8");

  // 100.64.0.0/10 - carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return deny("cgnat range 100.64.0.0/10");

  // 169.254.0.0/16 - link-local. Contains the cloud metadata endpoint.
  if (a === 169 && b === 254) return deny("link-local range 169.254.0.0/16 (cloud metadata)");

  // 172.16.0.0/12 - RFC1918. This is 172.16 through 172.31, NOT all of 172.
  if (a === 172 && b >= 16 && b <= 31) return deny("private range 172.16.0.0/12 (RFC1918)");

  // 192.0.0.0/24 - IETF protocol assignments.
  if (a === 192 && b === 0 && c === 0) return deny("reserved range 192.0.0.0/24");

  // 192.0.2.0/24 - TEST-NET-1.
  if (a === 192 && b === 0 && c === 2) return deny("documentation range 192.0.2.0/24");

  // 192.168.0.0/16 - RFC1918.
  if (a === 192 && b === 168) return deny("private range 192.168.0.0/16 (RFC1918)");

  // 198.18.0.0/15 - benchmarking.
  if (a === 198 && (b === 18 || b === 19)) return deny("benchmarking range 198.18.0.0/15");

  // 198.51.100.0/24 - TEST-NET-2.
  if (a === 198 && b === 51 && c === 100) return deny("documentation range 198.51.100.0/24");

  // 203.0.113.0/24 - TEST-NET-3.
  if (a === 203 && b === 0 && c === 113) return deny("documentation range 203.0.113.0/24");

  // 255.255.255.255 - limited broadcast. Checked before 240/4 so the reason is precise.
  if (a === 255 && b === 255 && c === 255 && d === 255) {
    return deny("broadcast address 255.255.255.255");
  }

  // 224.0.0.0/4 - multicast.
  if (a >= 224 && a <= 239) return deny("multicast range 224.0.0.0/4");

  // 240.0.0.0/4 - reserved for future use.
  if (a >= 240) return deny("reserved range 240.0.0.0/4");

  return ALLOWED;
}

/**
 * Expand an IPv6 literal to its 8 hextets.
 *
 * Handles `::` compression and a trailing dotted-quad (`::ffff:127.0.0.1`).
 * Returns null on anything malformed - the caller treats that as blocked.
 */
function parseIpv6(value: string): number[] | null {
  let text = value;

  // A zone index (fe80::1%eth0) is meaningless to us and only ever appears on
  // link-local addresses, which are blocked anyway. Strip it before parsing.
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  if (text.length === 0) return null;
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return null;

  // A trailing dotted-quad contributes the final two hextets.
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  if (lastColon === -1) return null;
  const afterLastColon = text.slice(lastColon + 1);
  if (afterLastColon.includes(".")) {
    const v4 = parseIpv4(afterLastColon);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    // Replace the dotted-quad with a single placeholder hextet, then swap it
    // for `tail` once the "::" expansion has produced a fixed-length array.
    text = text.slice(0, lastColon + 1) + "0";
  }

  const doubleColon = text.indexOf("::");
  if (doubleColon !== -1 && text.indexOf("::", doubleColon + 1) !== -1) return null;

  const toHextets = (segment: string): number[] | null => {
    if (segment.length === 0) return [];
    const out: number[] = [];
    for (const piece of segment.split(":")) {
      if (piece.length === 0 || piece.length > 4) return null;
      if (!/^[0-9a-fA-F]+$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };

  let hextets: number[];
  if (doubleColon === -1) {
    const parsed = toHextets(text);
    if (!parsed) return null;
    hextets = parsed;
  } else {
    const head = toHextets(text.slice(0, doubleColon));
    const rest = toHextets(text.slice(doubleColon + 2));
    if (!head || !rest) return null;
    // The placeholder hextet already occupies one slot when tail is present,
    // and tail replaces it with two - hence `tail.length - 1`.
    const occupied = head.length + rest.length + (tail.length > 0 ? tail.length - 1 : 0);
    const fillCount = 8 - occupied;
    if (fillCount < 0) return null;
    hextets = [...head, ...new Array<number>(fillCount).fill(0), ...rest];
  }

  if (tail.length > 0) hextets = [...hextets.slice(0, -1), ...tail];

  return hextets.length === 8 ? hextets : null;
}

function embeddedIpv4(h6: number, h7: number): [number, number, number, number] {
  return [(h6 >> 8) & 0xff, h6 & 0xff, (h7 >> 8) & 0xff, h7 & 0xff];
}

function classifyIpv6(h: number[]): IpVerdict {
  const h0 = h[0] as number;
  const h1 = h[1] as number;
  const h2 = h[2] as number;
  const h3 = h[3] as number;
  const h4 = h[4] as number;
  const h5 = h[5] as number;
  const h6 = h[6] as number;
  const h7 = h[7] as number;

  const topFiveZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;

  // ::/128 unspecified and ::1/128 loopback. Checked before the
  // IPv4-compatible unwrapping below, which would otherwise claim them.
  if (topFiveZero && h5 === 0 && h6 === 0 && h7 === 0) return deny("unspecified address ::/128");
  if (topFiveZero && h5 === 0 && h6 === 0 && h7 === 1) return deny("loopback address ::1/128");

  // ::ffff:a.b.c.d - IPv4-mapped. The single most common SSRF filter bypass:
  // a v6-shaped address whose real destination is 127.0.0.1.
  if (topFiveZero && h5 === 0xffff) {
    const v4 = embeddedIpv4(h6, h7);
    const verdict = classifyIpv4(v4);
    if (!verdict.allowed) return deny(`IPv4-mapped ${v4.join(".")}: ${verdict.reason}`);
    return ALLOWED;
  }

  // ::a.b.c.d - deprecated IPv4-compatible. Same unwrapping.
  if (topFiveZero && h5 === 0) {
    const v4 = embeddedIpv4(h6, h7);
    const verdict = classifyIpv4(v4);
    if (!verdict.allowed) return deny(`IPv4-compatible ${v4.join(".")}: ${verdict.reason}`);
    return ALLOWED;
  }

  // 64:ff9b::/96 and 64:ff9b:1::/48 - NAT64. The embedded v4 is the real target.
  if (h0 === 0x64 && h1 === 0xff9b) {
    const v4 = embeddedIpv4(h6, h7);
    const verdict = classifyIpv4(v4);
    if (!verdict.allowed) return deny(`NAT64-embedded ${v4.join(".")}: ${verdict.reason}`);
    return ALLOWED;
  }

  // 2002::/16 - 6to4. Hextets 1 and 2 carry the embedded IPv4 relay endpoint.
  if (h0 === 0x2002) {
    const v4: [number, number, number, number] = [
      (h1 >> 8) & 0xff,
      h1 & 0xff,
      (h2 >> 8) & 0xff,
      h2 & 0xff,
    ];
    const verdict = classifyIpv4(v4);
    if (!verdict.allowed) return deny(`6to4-embedded ${v4.join(".")}: ${verdict.reason}`);
    return ALLOWED;
  }

  // 100::/64 - discard-only address block.
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return deny("discard-only range 100::/64");

  // fc00::/7 - unique local addresses. The IPv6 equivalent of RFC1918.
  if ((h0 & 0xfe00) === 0xfc00) return deny("unique-local range fc00::/7");

  // fe80::/10 - link-local.
  if ((h0 & 0xffc0) === 0xfe80) return deny("link-local range fe80::/10");

  // ff00::/8 - multicast.
  if ((h0 & 0xff00) === 0xff00) return deny("multicast range ff00::/8");

  // 2001:db8::/32 - documentation.
  if (h0 === 0x2001 && h1 === 0x0db8) return deny("documentation range 2001:db8::/32");

  return ALLOWED;
}

/**
 * Decide whether we may open a connection to a resolved IP address.
 *
 * Accepts bracketed literals so a caller can hand it a URL hostname directly.
 */
export function classifyIp(address: string): IpVerdict {
  const value = address.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (value.length === 0) return deny("empty address");

  const v4 = parseIpv4(value);
  if (v4) return classifyIpv4(v4);

  if (value.includes(":")) {
    const v6 = parseIpv6(value);
    if (!v6) return deny(`unparseable IPv6 address ${JSON.stringify(address)}`);
    return classifyIpv6(v6);
  }

  // Not an IP literal in any form we recognise. We refuse rather than guess,
  // because every caller of this function is about to open a socket.
  return deny(`unparseable address ${JSON.stringify(address)}`);
}

export function isBlockedIp(address: string): boolean {
  return !classifyIp(address).allowed;
}

/**
 * True when `address` is already a literal IP rather than a name needing DNS.
 *
 * Callers use this to classify a literal directly instead of handing it to a
 * resolver. Both are safe, but going straight to the blocklist removes a
 * needless dependency on resolver behaviour - and `new URL()` normalises
 * shorthand forms like `http://2130706433/` into `127.0.0.1` before we ever see
 * them, so literals turn up more often than one would expect.
 */
export function isIpLiteral(address: string): boolean {
  const value = address.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (value.length === 0) return false;
  if (parseIpv4(value) !== null) return true;
  return value.includes(":") && parseIpv6(value) !== null;
}
