"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { SubmissionSelector, type SelectableDirectory } from "./submission-selector";

type Product = {
  id: string;
  url: string;
  name: string;
  tagline: string | null;
  description: string;
  category: string;
  contact_name: string;
  contact_email: string;
  logo_url: string | null;
  screenshot_url: string | null;
  status: string;
  created_at: string;
};

type Draft = Omit<Product, "id" | "created_at" | "contact_email" | "status">;

export function ProductWorkbench({ initialProducts, directories, contactEmail }: { initialProducts: Product[]; directories: SelectableDirectory[]; contactEmail: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error("We could not read that public site. Check its URL and try again.");
      const data = await response.json();
      setDraft({
        url: data.url,
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        category: "",
        contact_name: data.contact_name,
        logo_url: data.logo_url,
        screenshot_url: data.screenshot_url,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare this product.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ ...draft, logo_url: draft.logo_url || null, screenshot_url: draft.screenshot_url || null }),
      });
      if (response.status === 409) throw new Error(editingId ? "Sent product details cannot change. Edit the live listing at the directory." : "The free beta allows two products per founder.");
      if (!response.ok) throw new Error("Could not save the product. Check every field and try again.");
      const saved = await response.json() as Product;
      setProducts((current) => editingId ? current.map((product) => product.id === editingId ? saved : product) : [saved, ...current]);
      setDraft(null);
      setEditingId(null);
      setUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the product.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-12 grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <section aria-labelledby="products-heading">
        <div className="edge-heavy-t flex items-baseline justify-between py-5">
          <h2 id="products-heading" className="t-meta fg-heading">Your products</h2>
          <span className="t-micro fg-muted">{products.length} / 2 in free beta</span>
        </div>
        {products.length === 0 ? (
          <p className="fg-body py-8">No products yet. Add your first product to prepare its listing details.</p>
        ) : products.map((product) => (
          <article key={product.id} className="edge-t py-6">
            <p className="t-micro fg-accent">Product {product.id.slice(0, 8)}</p>
            <h3 className="t-display-sm fg-heading mt-2 text-3xl">{product.name}</h3>
            <p className="fg-muted mt-2">{product.category} · {product.url}</p>
            <p className="fg-body mt-3">{product.description}</p>
            {product.status === "ready" && <button type="button" className="t-micro fg-accent mt-4 underline" onClick={() => {
              setEditingId(product.id);
              setDraft({ url: product.url, name: product.name, tagline: product.tagline, description: product.description, category: product.category, contact_name: product.contact_name, logo_url: product.logo_url, screenshot_url: product.screenshot_url });
            }}>Edit before sending</button>}
            <SubmissionSelector product={product} directories={directories} contactEmail={contactEmail} onApproved={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, status: "submitted" } : item))} />
          </article>
        ))}
      </section>

      <section aria-labelledby="add-heading" className="edge-heavy-t py-5">
        <h2 id="add-heading" className="t-meta fg-heading">Add a product</h2>
        {products.length >= 2 && !editingId ? (
          <p className="fg-body mt-6">You have reached the two-product free beta limit.</p>
        ) : !draft ? (
          <form onSubmit={prepare} className="mt-6 space-y-5">
            <p className="fg-body">Paste your public site. You will review every detail before saving.</p>
            <label htmlFor="product-url" className="t-micro fg-muted block">Product website</label>
            <Input id="product-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourproduct.com" required maxLength={2048} />
            <Button type="submit" variant="signal" disabled={busy}>{busy ? "Reading site…" : "Prepare draft"}</Button>
          </form>
        ) : (
          <form onSubmit={save} className="mt-6 space-y-5">
            <p className="fg-body">Review and correct these fields. Nothing is sent to a directory when you save.</p>
            {([
              ["name", "Product name", 120],
              ["tagline", "Short description", 200],
              ["description", "Full description", 5000],
              ["category", "Category", 100],
              ["contact_name", "Your name", 120],
            ] as const).map(([key, label, maxLength]) => (
              <div key={key}>
                <label htmlFor={key} className="t-micro fg-muted block">{label}</label>
                {key === "description" ? (
                  <textarea id={key} className="mt-2 w-full border-b-2 border-ink/25 bg-transparent p-2 fg-heading" rows={5} maxLength={maxLength} required value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                ) : (
                  <Input id={key} className="mt-2" maxLength={maxLength} required value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                )}
              </div>
            ))}
            {([['logo_url', 'Logo URL'], ['screenshot_url', 'Product image URL']] as const).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="t-micro fg-muted block">{label} (optional)</label>
                <Input id={key} className="mt-2" type="url" maxLength={2048} value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
              </div>
            ))}
            <p className="t-micro fg-muted">Website: {draft.url}</p>
            <p className="t-micro fg-muted">Contact email from your verified account: {contactEmail}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="signal" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Save product"}</Button>
              <Button type="button" variant="outline" onClick={() => { setDraft(null); setEditingId(null); }} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="fg-danger mt-5">{error}</p>}
      </section>
    </div>
  );
}
