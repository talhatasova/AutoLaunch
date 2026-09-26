import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("shared package ESM boundary", () => {
  it("exposes runtime schemas to the worker's Node loader", () => {
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e",
      "import { companyProfileSchema } from '@directorylaunch/shared'; console.log(typeof companyProfileSchema)",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("object");
  });
});
