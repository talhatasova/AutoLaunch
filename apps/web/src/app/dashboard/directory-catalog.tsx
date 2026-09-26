"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type Directory = {
  id: string;
  name: string;
  url: string;
  category: string;
  price_kind: "free" | "paid" | "unknown";
  price_note: string | null;
  price_source_url: string | null;
  price_checked_at: string | null;
  obligation: string | null;
  last_verified_at: string | null;
  eligible: boolean;
};

export function DirectoryCatalog({ directories }: { directories: Directory[] }) {
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState("all");
  const shown = directories.filter((directory) =>
    (price === "all" || directory.price_kind === price) &&
    `${directory.name} ${directory.category}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section aria-labelledby="catalog-heading" className="mt-20">
      <div className="edge-heavy-t flex flex-wrap items-baseline justify-between gap-4 py-5">
        <div>
          <p className="t-micro fg-accent">Curated research</p>
          <h2 id="catalog-heading" className="t-display-sm fg-heading mt-3">Directory catalog</h2>
        </div>
        <span className="t-micro fg-muted">{directories.filter((directory) => directory.eligible).length} verified automatic targets</span>
      </div>
      <p className="fg-body mb-7 max-w-3xl">Listings are selectable only after we verify a complete free submission path and receipt. Research entries may still need a manual visit, payment, or newer evidence.</p>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label htmlFor="directory-search" className="t-micro fg-muted">Search directories</label>
          <Input id="directory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or category" />
        </div>
        <div>
          <label htmlFor="directory-price" className="t-micro fg-muted">Price</label>
          <select id="directory-price" value={price} onChange={(event) => setPrice(event.target.value)} className="fg-heading mt-3 w-full border-b-2 border-ink/25 bg-transparent py-3">
            <option value="all">All prices</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="unknown">Unverified</option>
          </select>
        </div>
      </div>
      {shown.length === 0 ? <p className="fg-muted edge-t mt-8 py-8">No directories match these filters.</p> : (
        <div className="mt-8 grid gap-x-8 lg:grid-cols-2">
          {shown.map((directory) => (
            <article key={directory.id} className="edge-t py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="t-micro fg-muted">{directory.category} / {directory.price_kind === "unknown" ? "Price unverified" : directory.price_kind}</p>
                  <h3 className="t-display-sm fg-heading mt-2 text-2xl">{directory.name}</h3>
                </div>
                <span className={`t-micro shrink-0 ${directory.eligible ? "fg-accent" : "fg-muted"}`}>{directory.eligible ? "Selectable" : "Research only"}</span>
              </div>
              {directory.price_note && <p className="fg-body mt-3">{directory.price_note}</p>}
              {directory.price_source_url && <a href={directory.price_source_url} target="_blank" rel="noopener noreferrer" className="t-micro fg-muted mt-3 inline-block underline">Price source · checked {directory.price_checked_at ? new Date(directory.price_checked_at).toLocaleDateString() : "date unknown"} ↗</a>}
              {directory.obligation && <p className="fg-body mt-3">Requirement: {directory.obligation}</p>}
              <p className="t-micro fg-muted mt-5">Last checked: {directory.last_verified_at ? new Date(directory.last_verified_at).toLocaleDateString() : "Not verified"}</p>
              <a href={directory.url} target="_blank" rel="noopener noreferrer" className="t-micro fg-accent mt-4 inline-block underline">Visit directory ↗</a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
