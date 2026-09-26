import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFileSchema } from "@directorylaunch/shared";
import type { Directory, SubmissionPayload } from "@directorylaunch/shared";
import { emptySnapshot } from "../drivers/challenge";
import type { DomSnapshot } from "../drivers/challenge";
import type { DriverReporter, PageLike, SubmissionContext } from "../drivers/types";

/**
 * A scriptable stand-in for a browser page.
 *
 * The Tier 2 driver is written against PageLike precisely so the ethical checks - challenge
 * detection, honeypot assertions, consent gating - can be tested deterministically without
 * launching Chromium and, more importantly, without ever pointing a test at a real
 * directory's live submission form.
 */
export interface FakeControl {
  value?: string;
  checked?: boolean;
}

export interface FakePageSpec {
  url: string;
  controls: Record<string, FakeControl>;
  /** One snapshot per call to snapshot(); the last one repeats. */
  snapshots?: Partial<DomSnapshot>[];
  textAfterSubmit?: string;
  urlAfterSubmit?: string;
  status?: number | null;
  /** Throw from goto to simulate a network fault. */
  gotoError?: Error;
}

export class FakePage implements PageLike {
  readonly filled: Array<{ selector: string; value: string }> = [];
  readonly checked: Array<{ selector: string; value: boolean }> = [];
  readonly selected: Array<{ selector: string; value: string }> = [];
  readonly clicks: string[] = [];
  closed = false;
  submitted = false;
  private snapshotIndex = 0;
  private currentUrlValue: string;

  constructor(private readonly spec: FakePageSpec) {
    this.currentUrlValue = spec.url;
  }

  private control(selector: string): FakeControl | undefined {
    return this.spec.controls[selector];
  }

  async goto(url: string): Promise<{ status: number | null }> {
    if (this.spec.gotoError) throw this.spec.gotoError;
    this.currentUrlValue = url;
    return { status: this.spec.status === undefined ? 200 : this.spec.status };
  }

  async currentUrl(): Promise<string> {
    return this.currentUrlValue;
  }

  async snapshot(): Promise<DomSnapshot> {
    const list = this.spec.snapshots ?? [{}];
    const idx = Math.min(this.snapshotIndex, list.length - 1);
    this.snapshotIndex += 1;
    return emptySnapshot({ url: this.currentUrlValue, ...list[idx] });
  }

  async exists(selector: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.spec.controls, selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    const c = this.control(selector);
    if (!c) throw new Error(`FakePage: fill on missing selector ${selector}`);
    c.value = value;
    this.filled.push({ selector, value });
  }

  async selectOption(selector: string, value: string): Promise<void> {
    const c = this.control(selector);
    if (!c) throw new Error(`FakePage: selectOption on missing selector ${selector}`);
    c.value = value;
    this.selected.push({ selector, value });
  }

  async setChecked(selector: string, checked: boolean): Promise<void> {
    const c = this.control(selector);
    if (!c) throw new Error(`FakePage: setChecked on missing selector ${selector}`);
    c.checked = checked;
    this.checked.push({ selector, value: checked });
  }

  async readValue(selector: string): Promise<string> {
    return this.control(selector)?.value ?? "";
  }

  async click(selector: string): Promise<void> {
    this.clicks.push(selector);
    this.submitted = true;
    if (this.spec.urlAfterSubmit) this.currentUrlValue = this.spec.urlAfterSubmit;
  }

  async visibleText(): Promise<string> {
    return this.submitted ? (this.spec.textAfterSubmit ?? "") : "";
  }

  async settle(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function recordingReporter(): DriverReporter & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    async fieldFilled(selector, payloadKey) {
      events.push(`field_filled:${payloadKey}`);
    },
    async submitted(detail) {
      events.push(`submitted:${detail.slice(0, 20)}`);
    },
    async note(kind, message) {
      events.push(`${kind}:${message.slice(0, 20)}`);
    },
  };
}

/** The real researched catalog. Tests run against production data, not invented shapes. */
const seedPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../seed/directories.json",
);

export function loadSeedDirectory(slug: string): Directory {
  const all = seedFileSchema.parse(JSON.parse(readFileSync(seedPath, "utf8")));
  const found = all.find((d) => d.slug === slug);
  if (!found) throw new Error(`No seed directory "${slug}"`);
  return found;
}

export function samplePayload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    name: "Acme Analytics",
    tagline: "Product analytics without the bloat",
    description: "Acme Analytics gives small teams event tracking in one afternoon.",
    url: "https://acme.example",
    category: "SaaS",
    tags: ["analytics", "saas"],
    logo_url: "https://acme.example/logo.png",
    screenshot_url: "https://acme.example/shot.png",
    // The authenticated founder's own address and name. Never generated.
    contact_email: "dana@acme.example",
    founder_name: "Dana Okafor",
    company_profile: null,
    ...overrides,
  };
}

export function makeContext(
  directory: Directory,
  overrides: Partial<SubmissionContext> = {},
): SubmissionContext {
  return {
    submission_id: "11111111-1111-4111-8111-111111111111",
    directory,
    payload: samplePayload(),
    consent: null,
    ...overrides,
  };
}
