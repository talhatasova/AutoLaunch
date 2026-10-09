"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { hostOf, plural } from "@/lib/format";
import { publishable } from "./publish";
import { STATE_FILL, STATE_LABEL, STATE_ORDER } from "./state";
import type { CatalogDirectory, Dashboard, DashboardProduct, Me } from "./types";

export function Overview({ me, dashboard, directories, productLimitReached, onOpen, onAdd }: {
  me: Me;
  dashboard: Dashboard;
  directories: CatalogDirectory[];
  productLimitReached: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { products, needs_attention } = dashboard;

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-head text-3xl fg-heading">Your products</h1>
          <p className="fg-muted mt-2 flex flex-wrap items-center gap-2">
            <span className="t-micro rounded-[2px] border edge-strong px-2 py-1 fg-heading">{me.plan === "pro" ? "Pro" : "Free"}</span>
            {me.plan === "free" ? "2 products · 2 channels each" : "Unlimited products and channels"}
          </p>
        </div>
        {products.length > 0 && (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button type="button" variant="signal" onClick={onAdd} disabled={productLimitReached}>Add product</Button>
            {productLimitReached && <p className="text-xs fg-muted">Free plan allows 2 products.</p>}
          </div>
        )}
      </header>

      {needs_attention.length > 0 && (
        <section aria-labelledby="attention-heading" className="mt-8 rounded-[2px] border border-[var(--accent)] surface-raised p-5">
          <h2 id="attention-heading" className="t-head text-lg fg-heading">Needs attention · {needs_attention.length}</h2>
          <ul className="mt-3 divide-y divide-[var(--border-default)]">
            {needs_attention.map((item) => (
              <li key={item.submission_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <p className="fg-body">
                  <span className="fg-heading font-medium">{item.product_name}</span>
                  {" on "}
                  {typeof item.directory === "string" ? item.directory : item.directory.name}
                  <span className="fg-muted"> — {item.reason}</span>
                </p>
                <button type="button" onClick={() => onOpen(item.product_id)} className="text-sm fg-heading underline underline-offset-4">Review</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {products.length === 0 ? (
        <section className="mt-10 rounded-[2px] border border-dashed edge-strong px-6 py-14 text-center">
          <h2 className="t-head text-2xl fg-heading">No products yet</h2>
          <p className="fg-body mx-auto mt-3 max-w-md">Add your site and we will read its public details, so you can review exactly what each channel receives before anything is sent.</p>
          <Button type="button" variant="signal" size="lg" className="mt-8" onClick={onAdd}>Add your first product</Button>
        </section>
      ) : (
        <ul className="mt-8 grid gap-5 lg:grid-cols-2">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} plan={me.plan} directories={directories} onOpen={() => onOpen(product.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ product, plan, directories, onOpen }: { product: DashboardProduct; plan: Me["plan"]; directories: CatalogDirectory[]; onOpen: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { n, reason } = publishable(plan, product, directories);
  const total = STATE_ORDER.reduce((sum, key) => sum + (product.counts[key] ?? 0), 0);

  async function publish() {
    setBusy(true);
    try {
      const created = await api<unknown[]>(`/products/${product.id}/publish`, { method: "POST", body: {} });
      toast.success(`Queued ${created.length} ${plural(created.length, "channel", "channels")} for ${product.name}.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-[2px] border border-[var(--border-default)] surface-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-head truncate text-xl fg-heading">{product.name}</h2>
          <p className="fg-muted truncate text-sm">{hostOf(product.url)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onOpen} aria-label={`Open ${product.name} channels`}>Channels</Button>
      </div>

      <div
        role="img"
        aria-label={total === 0 ? "No submissions yet" : STATE_ORDER.filter((k) => product.counts[k]).map((k) => `${product.counts[k]} ${STATE_LABEL[k]}`).join(", ")}
        className="mt-5 flex h-2 w-full overflow-hidden rounded-[2px] surface-sunk"
      >
        {STATE_ORDER.map((key) => {
          const count = product.counts[key] ?? 0;
          return count > 0 ? <span key={key} className={`${STATE_FILL[key]} h-full`} style={{ flexGrow: count }} /> : null;
        })}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
        {STATE_ORDER.map((key) => (
          <div key={key}>
            <dt className="flex items-center gap-1.5 text-xs fg-muted">
              <span aria-hidden className={`size-2 rounded-full ${STATE_FILL[key]}`} />
              {STATE_LABEL[key]}
            </dt>
            <dd className="tabular t-head text-lg fg-heading">{product.counts[key] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-col items-start gap-2 border-t border-[var(--border-default)] pt-4">
        <Button type="button" variant="signal" disabled={n === 0 || busy} onClick={publish} aria-describedby={n === 0 ? `why-${product.id}` : undefined}>
          {busy ? "Publishing…" : `Publish to ${n} ${plural(n, "channel", "channels")}`}
        </Button>
        {n === 0 && <p id={`why-${product.id}`} className="text-xs fg-muted">{reason}</p>}
      </div>
    </article>
  );
}
