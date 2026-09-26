import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetch, defaultDeps } from "./safe-fetch";
import { ScrapeError } from "./errors";

/**
 * The guard against a REAL socket, a REAL resolver and REAL `fetch`.
 *
 * Every other SSRF test stubs DNS, which proves the logic but not the wiring.
 * This one starts an actual HTTP server on loopback and asks the production
 * code path to fetch it. If the guard is misconfigured - wrong deps, a bypassed
 * check, a resolver that behaves differently from the stub - this test is what
 * notices, because the server records whether it was ever contacted.
 */

let server: Server;
let port = 0;
let hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url === "/redirect-to-metadata") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head><title>INTERNAL SERVICE</title></head></html>");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function expectRealBlock(url: string) {
  hits = [];
  await expect(safeFetch(url, { userAgent: "DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)" }, defaultDeps))
    .rejects.toBeInstanceOf(ScrapeError);
  // The proof: our own server never saw a request.
  expect(hits).toEqual([]);
}

describe("safeFetch against a real loopback server", () => {
  it("refuses a literal 127.0.0.1 without ever opening the socket", async () => {
    await expectRealBlock(`http://127.0.0.1:${port}/`);
  });

  it("refuses 'localhost', which the real resolver maps to loopback", async () => {
    await expectRealBlock(`http://localhost:${port}/`);
  });

  it("refuses IPv4 shorthand for loopback", async () => {
    await expectRealBlock(`http://2130706433:${port}/`);
    await expectRealBlock(`http://127.1:${port}/`);
  });

  it("refuses 0.0.0.0, which is an alias for loopback on Linux", async () => {
    await expectRealBlock(`http://0.0.0.0:${port}/`);
  });

  it("refuses the bracketed IPv6 loopback", async () => {
    await expectRealBlock(`http://[::1]:${port}/`);
  });

  it("refuses the cloud metadata endpoint by literal address", async () => {
    await expectRealBlock("http://169.254.169.254/latest/meta-data/iam/security-credentials/");
  });

  it("proves the server is live and would have answered, so the block is the reason", async () => {
    // Without this control the tests above would also pass against a server
    // that was never listening. Plain fetch, no guard.
    hits = [];
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toContain("INTERNAL SERVICE");
    expect(hits).toEqual(["/"]);
  });

  it("blocks a literal loopback address before DNS is consulted at all", async () => {
    // The hardening that makes the control above impossible to write through
    // safeFetch: an address that is already a literal is judged directly, so a
    // resolver cannot be talked into a different answer.
    let lookupCalls = 0;
    await expect(
      safeFetch(
        `http://127.0.0.1:${port}/`,
        { userAgent: "DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)" },
        {
          ...defaultDeps,
          lookup: async () => {
            lookupCalls += 1;
            return ["93.184.216.34"];
          },
        },
      ),
    ).rejects.toBeInstanceOf(ScrapeError);
    expect(lookupCalls).toBe(0);
  });
});
