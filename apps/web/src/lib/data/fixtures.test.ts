import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTORIES,
  CATALOG_REQUIREMENTS,
  OPENING_STATE,
  buildFixtureEvents,
  buildFixtureLaunch,
  requirementsFor,
} from "./fixtures";

/**
 * The fixture is a copy of the catalog, and a copy drifts.
 *
 * Every failure this file catches has already happened once: an opening state
 * or a timeline event naming a directory that was later removed, rendering a
 * blank row or throwing on `.find(...)!`. It also pins the two facts the UI is
 * built around - that Tier 1 is empty, and that the shape of a run is 2
 * automated against 21 handed back - so a silent seed change cannot leave the
 * dashboard telling a story the catalog no longer supports.
 */

const SEED = join(
  fileURLToPath(new URL(".", import.meta.url).href).replace(/[/\\]$/, ""),
  // src/lib/data -> src/lib -> src -> apps/web -> apps -> repo root
  "..",
  "..",
  "..",
  "..",
  "..",
  "seed",
  "directories.json",
);

interface SeedEntry {
  slug: string;
  tier: 1 | 2 | 3;
  requires_consent?: boolean;
  requires_profile_fields?: string[];
}

const seed = JSON.parse(readFileSync(SEED, "utf8")) as SeedEntry[];
const slugs = new Set(ALL_DIRECTORIES.map((d) => d.slug));

describe("the fixture catalog matches the seeded one", () => {
  it("carries every seeded directory, and nothing extra", () => {
    expect([...slugs].sort()).toEqual(seed.map((d) => d.slug).sort());
  });

  it("agrees with the seed on every tier", () => {
    for (const entry of seed) {
      const directory = ALL_DIRECTORIES.find((d) => d.slug === entry.slug);
      expect(directory?.tier, entry.slug).toBe(entry.tier);
    }
  });

  it("has no Tier 1 directories, which the UI states explicitly rather than implying", () => {
    expect(ALL_DIRECTORIES.filter((d) => d.tier === 1)).toHaveLength(0);
  });

  it("is 2 automatable against 21 handed back", () => {
    expect(ALL_DIRECTORIES.filter((d) => d.tier === 2)).toHaveLength(2);
    expect(ALL_DIRECTORIES.filter((d) => d.tier === 3)).toHaveLength(21);
  });
});

describe("per-directory requirements", () => {
  it("marks consent for exactly the directories the seed marks", () => {
    const seeded = seed.filter((d) => d.requires_consent).map((d) => d.slug);
    const fixture = ALL_DIRECTORIES.filter((d) => requirementsFor(d).requiresConsent).map((d) => d.slug);
    expect(fixture.sort()).toEqual(seeded.sort());
  });

  it("carries the same profile-field requirements as the seed", () => {
    for (const entry of seed) {
      const directory = ALL_DIRECTORIES.find((d) => d.slug === entry.slug)!;
      expect([...requirementsFor(directory).profileFields].sort(), entry.slug).toEqual(
        [...(entry.requires_profile_fields ?? [])].sort(),
      );
    }
  });

  it("gives every consent-gated directory something to actually agree to", () => {
    for (const directory of ALL_DIRECTORIES) {
      const requirements = requirementsFor(directory);
      if (!requirements.requiresConsent) continue;
      expect(requirements.consentStatement, directory.slug).toBeTruthy();
      // Naming the directory in its own agreement is what stops it reading as
      // a blanket "I agree to everything".
      expect(requirements.consentStatement).toContain(directory.name);
    }
  });

  it("explains why every profile-gated directory asks", () => {
    for (const directory of ALL_DIRECTORIES) {
      if (requirementsFor(directory).profileFields.length === 0) continue;
      expect(requirementsFor(directory).profileReason, directory.slug).toBeTruthy();
    }
  });

  it("has no requirements entry for a directory we no longer carry", () => {
    for (const slug of Object.keys(CATALOG_REQUIREMENTS)) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });
});

describe("no orphaned slugs", () => {
  it("has an opening state only for directories that exist", () => {
    for (const slug of Object.keys(OPENING_STATE)) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it("resolves every seeded timeline event to a real row", () => {
    const launch = buildFixtureLaunch();
    const events = buildFixtureEvents(launch);
    // A dropped event means a slug went stale and was silently filtered out.
    expect(events).toHaveLength(10);
    for (const event of events) {
      expect(slugs.has(event.directory_slug), event.directory_slug).toBe(true);
      expect(launch.rows.some((row) => row.id === event.submission_id)).toBe(true);
    }
  });

  it("gives every row a non-empty reason, in every state", () => {
    for (const row of buildFixtureLaunch().rows) {
      expect(row.detail.trim().length, row.directory.slug).toBeGreaterThan(0);
    }
  });
});
