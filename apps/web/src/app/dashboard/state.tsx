import type { ChannelType, StateKey } from "./types";

export const STATE_ORDER: StateKey[] = ["queued", "sending", "submitted", "live", "needs_attention", "failed", "not_published"];

export const STATE_LABEL: Record<StateKey, string> = {
  queued: "Queued",
  sending: "Sending",
  submitted: "Submitted",
  live: "Live",
  needs_attention: "Needs attention",
  failed: "Failed",
  not_published: "Not published",
};

/** Fill for the segmented bar and the pill dot. Text always accompanies colour. */
export const STATE_FILL: Record<StateKey, string> = {
  queued: "bg-[var(--brand-grey-300)]",
  sending: "bg-[var(--brand-signal-300)]",
  submitted: "bg-[var(--brand-grey-600)]",
  live: "bg-[#2f7d4f]",
  needs_attention: "bg-[var(--brand-signal-500)]",
  failed: "bg-[var(--brand-signal-800)]",
  not_published: "bg-[var(--brand-grey-400)]",
};

export function toStateKey(raw: string): StateKey {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (key in STATE_LABEL ? key : "queued") as StateKey;
}

export const CHANNEL_LABEL: Record<ChannelType, string> = { directory: "Directory", social: "Social", article: "Article", list: "List" };

export function StatePill({ state }: { state: string }) {
  const key = toStateKey(state);
  return (
    <span className="state-transition inline-flex items-center gap-2 whitespace-nowrap rounded-[2px] border edge-strong px-2 py-1 text-xs fg-heading">
      <span aria-hidden className={`size-2 rounded-full ${STATE_FILL[key]} ${key === "sending" ? "pulse-mark" : ""}`} />
      {STATE_LABEL[key]}
    </span>
  );
}

export function TypeChip({ type }: { type: ChannelType }) {
  return <span className="t-micro rounded-[2px] surface-sunk px-2 py-1 fg-body">{CHANNEL_LABEL[type] ?? "Directory"}</span>;
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "No activity yet";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
