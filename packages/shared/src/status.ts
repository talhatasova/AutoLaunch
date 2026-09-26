import { z } from "zod";

/**
 * The lifecycle of a single app-to-directory submission.
 *
 * `needs_manual` is deliberately NOT a failure. It is the terminal state for Tier 3
 * directories and for any flow we refuse to automate (CAPTCHA, bot-detection challenge,
 * login wall). We have done the work of assembling the payload; the user does one click.
 * Rendering it as a failure would misrepresent the product.
 */
export const submissionStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "needs_manual",
]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

/** States from which no further transition occurs. */
export const TERMINAL_STATUSES = [
  "succeeded",
  "failed",
  "needs_manual",
] as const satisfies readonly SubmissionStatus[];

export function isTerminal(status: SubmissionStatus): boolean {
  return (TERMINAL_STATUSES as readonly SubmissionStatus[]).includes(status);
}

export const appStatusSchema = z.enum(["draft", "ready", "launching", "done"]);
export type AppStatus = z.infer<typeof appStatusSchema>;

/** Directory health. `broken` means a verified integration stopped working. */
export const directoryStatusSchema = z.enum(["active", "broken"]);
export type DirectoryStatus = z.infer<typeof directoryStatusSchema>;
