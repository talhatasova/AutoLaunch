import type { CatalogDirectory, DashboardProduct, Plan } from "./types";

export const FREE_CHANNELS_PER_PRODUCT = 2;

/** N = eligible automated channels this product has not used yet, capped by plan. */
export function publishable(plan: Plan, product: DashboardProduct, directories: CatalogDirectory[]) {
  const used = new Set(product.submissions.map((s) => s.directory.slug));
  const open = directories.filter((d) => d.eligible && d.automation === "automated" && !(d.slug && used.has(d.slug)));
  const usedAutomated = product.submissions.filter((s) => s.directory.automation === "automated").length;
  const room = plan === "free" ? Math.max(0, FREE_CHANNELS_PER_PRODUCT - usedAutomated) : open.length;
  const n = Math.min(open.length, room);
  let reason = "";
  if (n === 0) reason = open.length === 0 ? "No certified automated channels are open for this product yet." : "Free plan covers 2 channels per product. Upgrade to publish to more.";
  return { n, reason };
}
