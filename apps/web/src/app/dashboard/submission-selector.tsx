"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export type SelectableDirectory = {
  id: string;
  name: string;
  eligible: boolean;
  obligation: string | null;
  requires_consent: boolean;
  terms_url: string | null;
  fields_sent: string[];
};

type Product = {
  id: string;
  name: string;
  url: string;
  tagline: string | null;
  description: string;
  category: string;
  contact_name: string;
  contact_email: string;
  logo_url: string | null;
  screenshot_url: string | null;
};

type Submission = { id: string; directory_id: string; status: string; result_url: string | null; error_message?: string | null; receipt_evidence?: { observed_url?: string | null } | null; submission_events?: { kind: string; message: string; created_at: string }[]; directories?: { name: string } };

export function SubmissionSelector({ product, directories, contactEmail, onApproved }: { product: Product; directories: SelectableDirectory[]; contactEmail: string; onApproved: () => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [consents, setConsents] = useState<string[]>([]);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [listingUrls, setListingUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await createClient().auth.getSession();
        if (!data.session) return;
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products/${product.id}/submissions`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!response.ok) throw new Error("Could not load submission history.");
        if (active) setSubmissions(await response.json());
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load submissions.");
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [product.id]);

  const remaining = Math.max(0, 2 - submissions.length);
  const available = directories.filter((directory) => directory.eligible && !submissions.some((submission) => submission.directory_id === directory.id));
  const chosen = available.filter((directory) => selected.includes(directory.id));
  const ready = chosen.length > 0 && chosen.length <= remaining && chosen.every((directory) =>
    (!directory.requires_consent || consents.includes(directory.id)) &&
    (!directory.obligation || confirmations.includes(directory.id)),
  );

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products/${product.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ reviewed_contact_email: contactEmail, targets: chosen.map((directory) => ({
          directory_id: directory.id,
          consent: consents.includes(directory.id),
          obligation_confirmed: confirmations.includes(directory.id),
        })) }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? "Could not approve the selection. Refresh and try again.");
      }
      const created = await response.json() as Submission[];
      setSubmissions((current) => [...created, ...current]);
      setSelected([]);
      onApproved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve the selection.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(submissionId: string) {
    setBusy(true);
    setError("");
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/submissions/${submissionId}/retry`, {
        method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? "This submission cannot be retried.");
      }
      setSubmissions((current) => current.map((submission) =>
        submission.id === submissionId ? { ...submission, status: "queued" } : submission,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry this submission.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyLive(submissionId: string) {
    setBusy(true);
    setError("");
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/submissions/${submissionId}/verify-live`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ url: listingUrls[submissionId] }),
      });
      if (!response.ok) throw new Error("We could not verify a public listing at that URL yet.");
      const evidence = await response.json() as { url: string };
      setSubmissions((current) => current.map((submission) =>
        submission.id === submissionId ? { ...submission, status: "live", result_url: evidence.url } : submission,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 edge-t pt-5">
      <p className="t-micro fg-heading">Directory submissions · {submissions.length} / 2 · {submissions.filter((item) => item.status === "live").length} live · {submissions.filter((item) => item.status === "pending_review").length} in review</p>
      {submissions.map((submission) => (
        <div key={submission.id} className="fg-body mt-3">
          <p>{submission.directories?.name ?? directories.find((directory) => directory.id === submission.directory_id)?.name ?? "Directory"}: {submission.status.replaceAll("_", " ")}
            {submission.result_url && <> · <a href={submission.result_url} target="_blank" rel="noopener noreferrer" className="underline">Listing ↗</a></>}
            {submission.status === "failed" && <> · <button type="button" disabled={busy} onClick={() => void retry(submission.id)} className="fg-accent underline disabled:opacity-50">Retry after review</button></>}
          </p>
          {submission.error_message && <p className="fg-muted mt-1">{submission.error_message}</p>}
          {submission.receipt_evidence && <p className="fg-muted mt-1">Receipt observed; publication is awaiting confirmation.</p>}
          {(submission.submission_events ?? []).length > 0 && (
            <details className="mt-2">
              <summary className="t-micro fg-accent cursor-pointer">View progress and evidence</summary>
              <ol className="mt-2 space-y-1 text-sm">
                {[...submission.submission_events ?? []].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((entry, index) => (
                  <li key={`${entry.created_at}-${index}`}>{new Date(entry.created_at).toLocaleString()}: {entry.message}</li>
                ))}
              </ol>
            </details>
          )}
          {(submission.status === "pending_review" || submission.status === "unconfirmed") && (
            <form onSubmit={(event) => { event.preventDefault(); void verifyLive(submission.id); }} className="mt-3 flex flex-wrap gap-2">
              <label htmlFor={`listing-${submission.id}`} className="sr-only">Public listing URL</label>
              <input id={`listing-${submission.id}`} type="url" required placeholder="Public listing URL from the directory" value={listingUrls[submission.id] ?? ""} onChange={(event) => setListingUrls({ ...listingUrls, [submission.id]: event.target.value })} className="min-w-64 flex-1 border-b-2 border-ink/25 bg-transparent p-2" />
              <Button type="submit" size="sm" variant="outline" disabled={busy}>Verify live</Button>
            </form>
          )}
        </div>
      ))}
      {!loaded && <p className="fg-muted mt-3">Loading submissions…</p>}
      {loaded && remaining > 0 && available.length === 0 && <p className="fg-muted mt-3">No verified automatic free directories are available yet.</p>}
      {loaded && remaining > 0 && available.length > 0 && (
        <div className="mt-5">
          <p className="fg-body">Choose up to {remaining} verified targets, then approve the exact details below.</p>
          {available.map((directory) => (
            <label key={directory.id} className="fg-heading edge-t mt-4 flex gap-3 py-3">
              <input type="checkbox" checked={selected.includes(directory.id)} disabled={!selected.includes(directory.id) && selected.length >= remaining} onChange={(event) => setSelected(event.target.checked ? [...selected, directory.id] : selected.filter((id) => id !== directory.id))} />
              {directory.name}
            </label>
          ))}
          {chosen.length > 0 && (
            <div className="surface-sunk mt-6 p-5">
              <h4 className="t-meta fg-heading">Approved product details</h4>
              <dl className="fg-body mt-4 grid gap-2 break-words text-sm">
                <div>Name: {product.name}</div><div>Website: {product.url}</div>
                <div>Short description: {product.tagline || "Not provided"}</div>
                <div>Description: {product.description}</div><div>Category: {product.category}</div>
                <div>Contact name: {product.contact_name}</div><div>Contact email: {contactEmail}</div>
                <div>Logo URL: {product.logo_url ?? "Not provided"}</div><div>Product image URL: {product.screenshot_url ?? "Not provided"}</div>
              </dl>
              {chosen.map((directory) => (
                <div key={directory.id} className="edge-t mt-5 pt-4">
                  <p className="t-micro fg-heading">{directory.name}</p>
                  <p className="fg-body mt-3">This directory&apos;s form uses: {directory.fields_sent.join(", ") || "No fields mapped"}.</p>
                  {directory.obligation && <label className="fg-body mt-3 flex gap-3"><input type="checkbox" checked={confirmations.includes(directory.id)} onChange={(event) => setConfirmations(event.target.checked ? [...confirmations, directory.id] : confirmations.filter((id) => id !== directory.id))} />I confirm this requirement is installed: {directory.obligation}</label>}
                  {directory.requires_consent && <label className="fg-body mt-3 flex gap-3"><input type="checkbox" checked={consents.includes(directory.id)} onChange={(event) => setConsents(event.target.checked ? [...consents, directory.id] : consents.filter((id) => id !== directory.id))} />I agree to this directory&apos;s <a href={directory.terms_url ?? "#"} target="_blank" rel="noopener noreferrer" className="underline">terms ↗</a></label>}
                </div>
              ))}
              <Button className="mt-6" type="button" variant="signal" disabled={!ready || busy} onClick={() => void approve()}>{busy ? "Approving…" : `Approve ${chosen.length} submission${chosen.length === 1 ? "" : "s"}`}</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="fg-danger mt-4">{error}</p>}
    </div>
  );
}
