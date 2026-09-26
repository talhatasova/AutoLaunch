import { describe, expect, it } from "vitest";
import { classifyIp, isBlockedIp } from "./ip-guard";

/**
 * The blocklist is the whole security control. Every range here corresponds to
 * something reachable from inside Railway's network that a user must not be able
 * to make our server fetch on their behalf.
 */
describe("classifyIp - IPv4 ranges that must never be fetched", () => {
  const blocked: Array<[string, string]> = [
    // The one that matters most: EC2/GCP/Azure instance metadata.
    ["169.254.169.254", "link-local"],
    ["169.254.0.1", "link-local"],
    // Loopback.
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback"],
    // RFC1918 - Railway's internal network lives here.
    ["10.0.0.1", "private"],
    ["10.255.255.255", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.254", "private"],
    ["192.168.1.1", "private"],
    // CGNAT.
    ["100.64.0.1", "cgnat"],
    ["100.127.255.255", "cgnat"],
    // This-network / unspecified.
    ["0.0.0.0", "unspecified"],
    ["0.1.2.3", "unspecified"],
    // Reserved / benchmarking / documentation / multicast / broadcast.
    ["192.0.0.1", "reserved"],
    ["192.0.2.1", "documentation"],
    ["198.18.0.1", "benchmarking"],
    ["198.51.100.1", "documentation"],
    ["203.0.113.1", "documentation"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
  ];

  for (const [ip, reason] of blocked) {
    it(`blocks ${ip} (${reason})`, () => {
      const verdict = classifyIp(ip);
      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toContain(reason);
    });
  }

  it("allows ordinary public IPv4", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "100.128.0.1", "172.15.255.255"]) {
      expect(classifyIp(ip).allowed, ip).toBe(true);
    }
  });

  // 172.16/12 has caught more naive implementations than any other range:
  // a "172.x is private" check is wrong and a "172.16-172.31" check is easy to
  // get off by one.
  it("gets the 172.16/12 boundaries exactly right", () => {
    expect(isBlockedIp("172.15.255.255")).toBe(false);
    expect(isBlockedIp("172.16.0.0")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("172.32.0.0")).toBe(false);
  });

  it("gets the 100.64/10 CGNAT boundaries exactly right", () => {
    expect(isBlockedIp("100.63.255.255")).toBe(false);
    expect(isBlockedIp("100.64.0.0")).toBe(true);
    expect(isBlockedIp("100.127.255.255")).toBe(true);
    expect(isBlockedIp("100.128.0.0")).toBe(false);
  });
});

describe("classifyIp - IPv6", () => {
  const blocked: Array<[string, string]> = [
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fc00::1", "unique-local"],
    ["fd12:3456:789a::1", "unique-local"],
    ["fe80::1", "link-local"],
    ["febf:ffff::1", "link-local"],
    ["ff02::1", "multicast"],
    ["100::1", "discard"],
  ];

  for (const [ip, reason] of blocked) {
    it(`blocks ${ip} (${reason})`, () => {
      const verdict = classifyIp(ip);
      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) expect(verdict.reason).toContain(reason);
    });
  }

  it("allows ordinary public IPv6", () => {
    expect(classifyIp("2606:4700:4700::1111").allowed).toBe(true);
    expect(classifyIp("2001:4860:4860::8888").allowed).toBe(true);
  });

  // An IPv4-mapped address is the classic bypass: the v6 parser sees a v6
  // address and the v4 blocklist never runs.
  it("unwraps IPv4-mapped addresses and applies the IPv4 rules", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:7f00:1")).toBe(true);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("unwraps 6to4 (2002::/16) and NAT64 (64:ff9b::/96) embedded IPv4", () => {
    // 2002:a00:1:: embeds 10.0.0.1
    expect(isBlockedIp("2002:a00:1::")).toBe(true);
    // 64:ff9b::169.254.169.254
    expect(isBlockedIp("64:ff9b::a9fe:a9fe")).toBe(true);
    // 2002:0808:0808:: embeds 8.8.8.8 - fine.
    expect(isBlockedIp("2002:808:808::")).toBe(false);
  });

  it("blocks anything it cannot parse rather than defaulting open", () => {
    for (const junk of ["", "not-an-ip", "999.999.999.999", "1.2.3", "::gggg"]) {
      expect(isBlockedIp(junk), junk).toBe(true);
    }
  });
});
