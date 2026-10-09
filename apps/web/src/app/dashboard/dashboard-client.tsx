"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Overview } from "./overview";
import { ProductDetail } from "./product-detail";
import { ProductForm } from "./product-form";
import { DirectoryCatalog } from "./directory-catalog";
import type { CatalogDirectory, Dashboard, Me, Product } from "./types";

type View = { kind: "overview" } | { kind: "catalog" } | { kind: "product"; id: string } | { kind: "form"; id?: string };

export function DashboardClient({ me, dashboard, directories, products }: { me: Me; dashboard: Dashboard; directories: CatalogDirectory[]; products: Product[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "overview" });

  const inFlight = dashboard.products.some((p) => (p.counts.queued ?? 0) + (p.counts.sending ?? 0) > 0);
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };
  const productLimitReached = me.plan === "free" && products.length >= 2;
  const tab = view.kind === "catalog" ? "catalog" : "products";

  return (
    <div>
      <nav aria-label="Workspace sections" className="mb-8 flex items-center gap-6 border-b border-[var(--border-default)]">
        {([["products", "Products", { kind: "overview" }], ["catalog", "Channel catalog", { kind: "catalog" }]] as const).map(([key, label, target]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => go(target)}
            className={`state-transition -mb-px border-b-2 py-3 text-sm font-medium ${tab === key ? "border-[var(--accent)] fg-heading" : "border-transparent fg-muted hover:text-[var(--text-heading)]"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {view.kind === "overview" && (
        <Overview
          me={me}
          dashboard={dashboard}
          directories={directories}
          productLimitReached={productLimitReached}
          onOpen={(id) => go({ kind: "product", id })}
          onAdd={() => go({ kind: "form" })}
        />
      )}
      {view.kind === "product" && (
        <ProductDetail
          key={view.id}
          dashboardProduct={dashboard.products.find((p) => p.id === view.id)}
          product={products.find((p) => p.id === view.id)}
          directories={directories}
          onBack={() => go({ kind: "overview" })}
          onEdit={() => go({ kind: "form", id: view.id })}
        />
      )}
      {view.kind === "form" && (
        <ProductForm
          key={view.id ?? "new"}
          product={products.find((p) => p.id === view.id)}
          directories={directories}
          defaultEmail={me.email}
          onDone={(id) => go(id ? { kind: "product", id } : { kind: "overview" })}
        />
      )}
      {view.kind === "catalog" && <DirectoryCatalog directories={directories} products={products} />}
    </div>
  );
}
