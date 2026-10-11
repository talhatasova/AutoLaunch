export type Plan = "free" | "pro";
export type StateKey = "queued" | "sending" | "submitted" | "live" | "needs_attention" | "failed" | "not_published";
export type ChannelType = "directory" | "social" | "article" | "list";
export type Automation = "automated" | "manual" | "paid_link";

export type Me = { id: string; email: string; plan: Plan };

export type DirectoryRef = { slug: string; name: string; channel_type: ChannelType; automation: Automation; price_kind: "free" | "paid" | "unknown" };

export type DashboardSubmission = {
  id: string;
  directory: DirectoryRef;
  status: string;
  display_state: string;
  receipt_url: string | null;
  live_url: string | null;
  last_event_at: string | null;
  last_event_kind: string | null;
};

export type DashboardProduct = {
  id: string;
  name: string;
  url: string;
  counts: Record<string, number>;
  submissions: DashboardSubmission[];
};

export type NeedsAttention = { submission_id: string; product_id: string; product_name: string; directory: string | { name: string }; status: string; reason: string };

export type Dashboard = { products: DashboardProduct[]; needs_attention: NeedsAttention[] };

export type Product = {
  id: string;
  url: string;
  name: string;
  tagline: string | null;
  description: string;
  category: string;
  contact_name: string;
  logo_url: string | null;
  screenshot_url: string | null;
  public_contact_email: string | null;
  launch_post: string | null;
  long_description: string | null;
  company_profile: Record<string, string | null> | null;
};

export type CatalogDirectory = {
  id: string;
  slug?: string;
  name: string;
  url: string;
  category: string;
  channel_type?: ChannelType;
  automation?: Automation;
  challenge_kind?: string;
  terms_prohibit_automation?: boolean;
  obligation: string | null;
  price_kind: "free" | "paid" | "unknown";
  price_note: string | null;
  price_source_url: string | null;
  price_cents?: number | null;
  eligible: boolean;
};

export type SubmissionEvent = { id: string; kind: string; message: string; payload: unknown; created_at: string };
