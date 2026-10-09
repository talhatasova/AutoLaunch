import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { describeError } from "../logger";
import type { Logger } from "../logger";

/**
 * DirectoryLaunch's platform Gmail inbox, read over IMAP with an app password. Every
 * submission uses its own plus-address, so a verification email maps to exactly one
 * submission. Links are returned only when their host is the directory's host or a
 * subdomain of it (phishing / SSRF guard); the caller opens them in a Playwright page.
 */
const POLL_MS = 10_000;

function credentials(): { user: string; pass: string } | null {
  const user = process.env.PLATFORM_INBOX_ADDRESS;
  const pass = process.env.PLATFORM_INBOX_APP_PASSWORD;
  return user && pass ? { user, pass } : null;
}

export const inboxConfigured = (): boolean => credentials() !== null;

/** `local+<submissionId>@domain`, or null when the inbox is not configured. */
export function plusAddress(submissionId: string): string | null {
  const creds = credentials();
  if (!creds) return null;
  const at = creds.user.lastIndexOf("@");
  const local = creds.user.slice(0, at).split("+")[0];
  return `${local}+${submissionId}@${creds.user.slice(at + 1)}`;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

export function onDirectoryHost(link: string, directoryHost: string): boolean {
  try {
    const url = new URL(link);
    const host = bareHost(url.hostname);
    const want = bareHost(directoryHost);
    return url.protocol === "https:" && !url.username && !url.password && (host === want || host.endsWith(`.${want}`));
  } catch {
    return false;
  }
}

export function extractLinks(html: string, text: string): string[] {
  const hrefs = [...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  const bare = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => m[0]);
  return [...new Set([...hrefs, ...bare])];
}

export interface WaitOptions {
  to: string;
  directoryHost: string;
  fromContains?: string;
  timeoutMs: number;
  log: Logger;
}

/** Polls INBOX until a matching message carries a directory-host link, or the timeout. */
export async function waitForVerificationLink(opts: WaitOptions): Promise<string | null> {
  const creds = credentials();
  if (!creds) return null;
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: creds, logger: false });
  const deadline = Date.now() + opts.timeoutMs;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // IMAP SINCE is day-granular
  await client.connect();
  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = (await client.search({ to: opts.to, since }, { uid: true })) || [];
        for (const uid of [...uids].reverse()) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const mail = await simpleParser(msg.source);
          const from = mail.from?.text ?? "";
          if (opts.fromContains && !from.toLowerCase().includes(opts.fromContains.toLowerCase())) continue;
          const link = extractLinks(typeof mail.html === "string" ? mail.html : "", mail.text ?? "")
            .find((l) => onDirectoryHost(l, opts.directoryHost));
          if (link) {
            opts.log.info("verification email found", { link_host: new URL(link).hostname });
            return link;
          }
        }
      } finally {
        lock.release();
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return null;
  } finally {
    await client.logout().catch((cause) => opts.log.warn("inbox logout failed", describeError(cause)));
  }
}
