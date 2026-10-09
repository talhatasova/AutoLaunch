"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { CatalogDirectory, Product } from "./types";

type Draft = Omit<Product, "id">;
const POST_MAX = 300;
const field = "mt-1 w-full rounded-[2px] border edge-strong bg-transparent px-3 py-2 fg-heading";
const label = "text-sm font-medium fg-heading";

export function ProductForm({ product, defaultEmail, directories, onDone }: {
  product?: Product;
  defaultEmail: string;
  directories: CatalogDirectory[];
  onDone: (id?: string) => void;
}) {
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | undefined>(product?.id);
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<Draft | null>(product ? { ...product } : null);
  const [busy, setBusy] = useState<"" | "read" | "save" | "generate">("");
  const [error, setError] = useState("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  async function read(e: FormEvent) {
    e.preventDefault();
    setBusy("read");
    setError("");
    try {
      const response = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      if (!response.ok) throw new Error("We could not read that public site. Check the URL, or fill in the details by hand.");
      const d = await response.json();
      setDraft({ url: d.url, name: d.name, tagline: d.tagline, description: d.description, category: "", contact_name: d.contact_name, logo_url: d.logo_url, screenshot_url: d.screenshot_url, public_contact_email: defaultEmail, launch_post: null, long_description: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that site.");
    } finally {
      setBusy("");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy("save");
    setError("");
    const body = { ...draft, logo_url: draft.logo_url || null, screenshot_url: draft.screenshot_url || null, public_contact_email: draft.public_contact_email || null, launch_post: draft.launch_post || null, long_description: draft.long_description || null };
    try {
      const saved = await api<Product>(savedId ? `/products/${savedId}` : "/products", { method: savedId ? "PATCH" : "POST", body });
      setSavedId(saved.id);
      toast.success("Product saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the product.");
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    if (!savedId) return;
    setBusy("generate");
    setError("");
    try {
      const text = await api<{ launch_post: string; long_description: string }>(`/products/${savedId}/launch-text`, { method: "POST" });
      setDraft((d) => (d ? { ...d, launch_post: text.launch_post.slice(0, POST_MAX), long_description: text.long_description } : d));
      toast.success("Draft written. Edit it, then save.");
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Drafting is unavailable right now. You can write the text yourself.");
    } finally {
      setBusy("");
    }
  }

  const heading = product ? `Edit ${product.name}` : "Add a product";

  if (!draft) {
    return (
      <form onSubmit={read} className="max-w-xl">
        <h1 className="t-head text-3xl fg-heading">{heading}</h1>
        <p className="fg-body mt-2">Paste your public website. We read its title and description so you only have to review them. Nothing is sent to any channel yet.</p>
        <label htmlFor="product-url" className={`${label} mt-6 block`}>Product website</label>
        <input id="product-url" type="url" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourproduct.com" className={`${field} text-lg`} />
        {error && <p role="alert" className="fg-danger mt-3 text-sm">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit" variant="signal" disabled={busy === "read"}>{busy === "read" ? "Reading site…" : "Read my site"}</Button>
          <Button type="button" variant="ghost" onClick={() => onDone()}>Cancel</Button>
        </div>
      </form>
    );
  }

  const postLen = (draft.launch_post ?? "").length;
  const preview: [string, string | null][] = [
    ["Name", draft.name], ["Website", draft.url], ["Tagline", draft.tagline], ["Description", draft.description], ["Category", draft.category],
    ["Logo", draft.logo_url], ["Public contact email", draft.public_contact_email], ["Launch post", draft.launch_post], ["Long description", draft.long_description],
  ];
  const automated = directories.filter((d) => d.eligible && d.automation === "automated");

  return (
    <form onSubmit={save} className="max-w-3xl">
      <h1 className="t-head text-3xl fg-heading">{heading}</h1>
      <p className="fg-body mt-2">Review and correct each field. Saving does not send anything.</p>

      <fieldset className="mt-6 grid gap-5 sm:grid-cols-2">
        <legend className="t-head mb-3 text-lg fg-heading">Details</legend>
        <div>
          <label htmlFor="f-name" className={label}>Product name</label>
          <input id="f-name" required maxLength={120} className={field} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-category" className={label}>Category</label>
          <input id="f-category" required maxLength={100} className={field} value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Developer tools" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-tagline" className={label}>Tagline</label>
          <input id="f-tagline" maxLength={200} className={field} value={draft.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-desc" className={label}>Description</label>
          <textarea id="f-desc" required rows={4} maxLength={5000} className={field} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-logo" className={label}>Logo URL <span className="fg-muted font-normal">(optional)</span></label>
          <input id="f-logo" type="url" maxLength={2048} className={field} value={draft.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-email" className={label}>Public contact email</label>
          <input id="f-email" type="email" required className={field} value={draft.public_contact_email ?? ""} onChange={(e) => set("public_contact_email", e.target.value)} aria-describedby="f-email-hint" />
          <p id="f-email-hint" className="mt-1 text-xs fg-muted">Shown on public listings. Use an address you are happy to expose.</p>
        </div>
        <div>
          <label htmlFor="f-contact" className={label}>Your name</label>
          <input id="f-contact" required maxLength={120} className={field} value={draft.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="mt-8 border-t border-[var(--border-default)] pt-6">
        <legend className="t-head text-lg fg-heading">Launch text</legend>
        <p className="fg-body mt-1 text-sm">Write your own, or let us draft it from your saved details. Drafts are not stored until you save.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={!savedId || busy === "generate"} onClick={generate}>{busy === "generate" ? "Writing…" : "Generate"}</Button>
          {!savedId && <span className="text-xs fg-muted">Save the product first so the draft can use it.</span>}
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="f-post" className={label}>Launch post</label>
            <span aria-live="polite" className={`tabular text-xs ${postLen > POST_MAX ? "fg-danger" : "fg-muted"}`}>{postLen} / {POST_MAX}</span>
          </div>
          <textarea id="f-post" rows={3} maxLength={POST_MAX} className={field} value={draft.launch_post ?? ""} onChange={(e) => set("launch_post", e.target.value)} />
        </div>
        <div className="mt-4">
          <label htmlFor="f-long" className={label}>Long description</label>
          <textarea id="f-long" rows={6} maxLength={5000} className={field} value={draft.long_description ?? ""} onChange={(e) => set("long_description", e.target.value)} />
        </div>
      </fieldset>

      <details className="mt-8 rounded-[2px] border border-[var(--border-default)] surface-raised p-4">
        <summary className="cursor-pointer text-sm font-medium fg-heading">Preview what each channel receives</summary>
        <dl className="mt-3 grid gap-2 break-words text-sm">
          {preview.map(([k, v]) => (
            <div key={k} className="grid gap-x-4 sm:grid-cols-[10rem_1fr]">
              <dt className="fg-muted">{k}</dt>
              <dd className="fg-heading">{v || <span className="fg-muted">Not provided</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs fg-muted">
          {automated.length > 0 ? `Sent to: ${automated.map((d) => d.name).join(", ")}. Each channel uses only the fields its form has.` : "No automated channel is certified yet, so nothing would be sent today."}
        </p>
      </details>

      {error && <p role="alert" className="fg-danger mt-5 text-sm">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" variant="signal" disabled={busy === "save" || postLen > POST_MAX}>{busy === "save" ? "Saving…" : savedId ? "Save changes" : "Save product"}</Button>
        <Button type="button" variant="outline" onClick={() => onDone(savedId)}>{savedId ? "Done" : "Cancel"}</Button>
      </div>
    </form>
  );
}
