"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TypeChip } from "./state";
import type { CatalogDirectory, Product } from "./types";

const GROUPS = [
  { key: "automated", title: "Automated", blurb: "We submit these for you once they pass live certification." },
  { key: "manual", title: "Manual", blurb: "You submit these yourself. Copy your details, then open the form." },
  { key: "paid_link", title: "Paid", blurb: "These charge a fee. We link out; you pay and submit directly." },
] as const;

function price(d: CatalogDirectory) {
  if (d.price_kind === "free") return "Free";
  if (d.price_kind === "paid") return d.price_note ?? (d.price_cents ? `$${(d.price_cents / 100).toFixed(0)}` : "Paid");
  return "Price unverified";
}

export function DirectoryCatalog({ directories, products }: { directories: CatalogDirectory[]; products: Product[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const chosen = products.find((p) => p.id === productId);

  async function copyKit() {
    if (!chosen) return;
    const text = [`Name: ${chosen.name}`, `Tagline: ${chosen.tagline ?? ""}`, `Description: ${chosen.long_description || chosen.description}`, `URL: ${chosen.url}`].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied details for ${chosen.name}.`);
    } catch {
      toast.error("Could not copy. Select the text from your product page instead.");
    }
  }

  return (
    <div>
      <h1 className="t-head text-3xl fg-heading">Channel catalog</h1>
      <p className="fg-body mt-2 max-w-2xl">Every channel we track, including ones still being certified. Automated channels become available only after a live end-to-end test.</p>

      {GROUPS.map((group) => {
        const rows = directories.filter((d) => (d.automation ?? "manual") === group.key);
        return (
          <section key={group.key} aria-labelledby={`g-${group.key}`} className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id={`g-${group.key}`} className="t-head text-xl fg-heading">{group.title} <span className="fg-muted font-normal">· {rows.length}</span></h2>
                <p className="fg-muted text-sm">{group.blurb}</p>
              </div>
              {group.key === "manual" && products.length > 0 && (
                <div className="flex items-center gap-2">
                  {products.length > 1 && (
                    <>
                      <label htmlFor="kit-product" className="sr-only">Product for copy kit</label>
                      <select id="kit-product" value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-[2px] border edge-strong bg-transparent px-2 py-2 text-sm fg-heading">
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={copyKit}>Copy kit{chosen ? ` for ${chosen.name}` : ""}</Button>
                </div>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="fg-muted mt-4 rounded-[2px] border border-dashed edge-strong p-4 text-sm">No channels in this group yet.</p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {rows.map((d) => (
                  <li key={d.id} className="rounded-[2px] border border-[var(--border-default)] surface-raised p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-medium fg-heading">{d.name}</h3>
                      <div className="flex items-center gap-2">
                        <TypeChip type={d.channel_type ?? "directory"} />
                        {group.key === "automated" && (
                          <span className={`t-micro rounded-[2px] px-2 py-1 ${d.eligible ? "surface-accent" : "surface-sunk fg-body"}`}>{d.eligible ? "Eligible" : "Coming soon"}</span>
                        )}
                      </div>
                    </div>
                    <p className="fg-muted mt-1 text-sm">{d.category} · {price(d)}</p>
                    {d.obligation && <p className="fg-body mt-2 text-sm"><span className="font-medium">Requirement:</span> {d.obligation}</p>}
                    {d.terms_prohibit_automation && <p className="fg-body mt-2 text-sm"><span className="font-medium">Terms:</span> this site prohibits automated submission, so it stays manual.</p>}
                    {d.price_source_url && d.price_kind !== "free" && <a href={d.price_source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs fg-muted underline underline-offset-4">Price source ↗</a>}
                    {(group.key !== "automated" || !d.eligible) && (
                      <div className="mt-3">
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm fg-heading underline underline-offset-4">{group.key === "paid_link" ? "View pricing and submit ↗" : group.key === "manual" ? "Open submission page ↗" : "Visit site ↗"}</a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
