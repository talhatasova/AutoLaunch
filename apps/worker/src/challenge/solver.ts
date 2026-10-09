export type SolveResult =
  | { ok: true; token: string; costCents: number }
  | { ok: false; status: number; reason: string; costCents: 0 };

// ponytail: placeholder until the CapSolver integration lands (docs/agents/automation-rules.md).
// Every challenge resolves needs_manual with this reason.
export function solveChallenge(_kind: string): SolveResult {
  return { ok: false, status: 501, reason: "CAPTCHA solving is not implemented yet.", costCents: 0 };
}
