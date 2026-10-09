import { decrypt, encrypt } from "../crypto";
import * as repo from "../db/repository";
import type { Db } from "../db/repository";
import { ChallengeDetectedError, PermanentError, SelectorMissingError } from "../errors";
import type { PlaywrightPool, SessionPage } from "../net/browser";
import { bareHost, onHost } from "../net/host";
import { detectChallenge } from "./challenge";
import type { LoginRecipe } from "./recipe";
import { describeSignal, evaluateSuccessSignal } from "./success";

/**
 * DirectoryLaunch's own account on a channel, created once by the team. Read with the
 * service role only; secrets are decrypted here and never leave the worker.
 */
export interface PlatformAccount {
  id: string;
  username: string;
  secret: string;
  session: string | null;
}

type Note = (message: string, payload: Record<string, unknown>) => Promise<void>;

export async function loadPlatformAccount(db: Db, directoryId: string): Promise<PlatformAccount> {
  const row = await repo.loadPlatformAccount(db, directoryId);
  if (!row) throw new PermanentError("No platform account is configured for this channel.");
  if (row.status !== "active") throw new PermanentError(`The platform account for this channel is ${row.status}.`);
  return {
    id: row.id,
    username: row.username,
    secret: decrypt(row.secret_enc),
    session: row.session_enc ? decrypt(row.session_enc) : null,
  };
}

/**
 * Opens a page signed in as the platform account. Restores the saved browser state; if the
 * login form still shows, logs in with the stored credentials and saves the new state.
 * A failed login marks the account `broken` so no other job reuses bad credentials.
 */
export async function openPlatformPage(
  db: Db,
  pool: PlaywrightPool,
  directoryId: string,
  directoryUrl: string,
  login: LoginRecipe | undefined,
  note: Note,
): Promise<SessionPage> {
  const account = await loadPlatformAccount(db, directoryId);
  const page = await pool.newIsolatedPage(account.session ? JSON.parse(account.session) : undefined);
  try {
    if (!login) {
      if (!account.session) throw new PermanentError("Channel needs a platform session but has no saved session or login recipe.");
      await note("Restored the saved platform session.", { step: "login", reused: true });
      return page;
    }
    await page.goto(login.url);
    const challenge = detectChallenge(await page.snapshot());
    if (challenge) throw new ChallengeDetectedError(`${challenge.detail} (on the login page) [${challenge.kind}]`);
    if (!(await page.exists(login.username_selector))) {
      await note("Signed in with the saved platform session.", { step: "login", reused: true });
      return page;
    }
    // Never type credentials into a page that is not the directory (redirect, hijacked login URL).
    if (!onHost(await page.currentUrl(), bareHost(directoryUrl))) {
      await repo.updatePlatformAccount(db, account.id, { status: "broken", session_enc: null });
      throw new PermanentError("Platform login aborted: login page is not on the directory's host. Account marked broken.");
    }
    for (const selector of [login.password_selector, login.submit_selector]) {
      if (!(await page.exists(selector))) throw new SelectorMissingError(selector, "login form changed");
    }
    await page.fill(login.username_selector, account.username);
    await page.fill(login.password_selector, account.secret);
    await page.click(login.submit_selector);
    await page.settle(2_500);
    const after = detectChallenge(await page.snapshot());
    if (after) throw new ChallengeDetectedError(`${after.detail} (after login) [${after.kind}]`);
    const result = evaluateSuccessSignal(login.success_signal, {
      url: await page.currentUrl(),
      visibleText: await page.visibleText(),
      selectorPresent: login.success_signal.kind === "selector_present" && (await page.exists(login.success_signal.value)),
    });
    if (result.kind !== "confirmed") {
      await repo.updatePlatformAccount(db, account.id, { status: "broken", session_enc: null });
      throw new PermanentError(`Platform login failed: expected ${describeSignal(login.success_signal)}. Account marked broken.`);
    }
    await repo.saveSession(db, account.id, encrypt(JSON.stringify(await page.storageState())));
    await note("Signed in with the platform account and saved the session.", { step: "login", reused: false });
    return page;
  } catch (error) {
    await page.close().catch(() => undefined); // the original error is the one that matters
    throw error;
  }
}
