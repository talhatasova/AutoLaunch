"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { clockTime, hostOf } from "@/lib/format";
import { relativeTime, StatePill, toStateKey, TypeChip } from "./state";
import type { CatalogDirectory, DashboardProduct, DashboardSubmission, Product, SubmissionEvent } from "./types";

function cost(sub: DashboardSubmission, directories: CatalogDirectory[]) {
  const d = directories.find((x) => x.slug === sub.directory.slug);
  if (sub.directory.price_kind === "free") return "Free";
  if (sub.directory.price_kind === "paid") return d?.price_note ?? "Paid";
  return "Unverified";
}

const canVerify = (s: DashboardSubmission) => ["submitted", "needs_attention"].includes(toStateKey(s.display_state));
const canRetry = (s: DashboardSubmission) => toStateKey(s.display_state) === "failed";

export function ProductDetail({ dashboardProduct, product, directories, onBack, onEdit }: {
  dashboardProduct?: DashboardProduct;
  product?: Product;
  directories: CatalogDirectory[];
  onBack: () => void;
  onEdit: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!dashboardProduct) {
    return (
      <div>
        <p className="fg-body">This product is no longer available.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={onBack}>Back to products</Button>
      </div>
    );
  }
  const subs = dashboardProduct.submissions;
  const open = subs.find((s) => s.id === openId) ?? null;

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm fg-muted underline underline-offset-4 hover:text-[var(--text-heading)]">← All products</button>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-head text-3xl fg-heading">{dashboardProduct.name}</h1>
          <a href={dashboardProduct.url} target="_blank" rel="noopener noreferrer" className="fg-muted text-sm underline underline-offset-4">{hostOf(dashboardProduct.url)} ↗</a>
        </div>
        {product && <Button type="button" variant="outline" onClick={onEdit}>Edit details</Button>}
      </header>

      <section aria-labelledby="channels-heading" className="mt-8">
        <h2 id="channels-heading" className="t-head text-lg fg-heading">Channels</h2>
        {subs.length === 0 ? (
          <p className="fg-body mt-3 rounded-[2px] border border-dashed edge-strong p-6">Nothing has been sent for this product yet. Go back to the overview and choose Publish to queue your first channels.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[2px] border border-[var(--border-default)] surface-raised">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Submission status for each channel</caption>
              <thead>
                <tr className="border-b border-[var(--border-default)] text-xs fg-muted">
                  {["Channel", "Type", "Cost", "State", "Link", "Last event"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} className="state-transition cursor-pointer border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--surface-sunk)]">
                    <th scope="row" className="px-4 py-3 font-medium fg-heading">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(s.id); }} className="text-left underline-offset-4 hover:underline" aria-label={`${s.directory.name}: open event trail`}>{s.directory.name}</button>
                    </th>
                    <td className="px-4 py-3"><TypeChip type={s.directory.channel_type} /></td>
                    <td className="px-4 py-3 fg-body">{cost(s, directories)}</td>
                    <td className="px-4 py-3"><StatePill state={s.display_state} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {s.live_url ? <a className="underline underline-offset-4 fg-heading" href={s.live_url} target="_blank" rel="noopener noreferrer">Live listing ↗</a>
                        : s.receipt_url ? <a className="underline underline-offset-4 fg-heading" href={s.receipt_url} target="_blank" rel="noopener noreferrer">Receipt ↗</a>
                        : <span className="fg-muted">None yet</span>}
                    </td>
                    <td className="px-4 py-3 fg-muted">{relativeTime(s.last_event_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Drawer.Root open={open !== null} onOpenChange={(v) => !v && setOpenId(null)} direction="right">
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Drawer.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto surface-raised p-6 outline-none">
            {open && <Trail key={open.id} sub={open} directories={directories} onClose={() => setOpenId(null)} />}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

function Trail({ sub, onClose }: { sub: DashboardSubmission; directories: CatalogDirectory[]; onClose: () => void }) {
  const router = useRouter();
  const [events, setEvents] = useState<SubmissionEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    api<SubmissionEvent[]>(`/submissions/${sub.id}/events`)
      .then((rows) => active && setEvents(rows))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [sub.id, sub.last_event_at]);

  async function act(run: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await run();
      toast.success(ok);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api(`/submissions/${sub.id}/verify-live`, { method: "POST", body: { url } }), "Checking the listing — it will show as Live once confirmed.");
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Drawer.Title className="t-head text-xl fg-heading">{sub.directory.name}</Drawer.Title>
          <Drawer.Description className="sr-only">Event trail and actions for this submission</Drawer.Description>
          <div className="mt-2"><StatePill state={sub.display_state} /></div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      {(canRetry(sub) || canVerify(sub)) && (
        <div className="mt-6 space-y-5 border-t border-[var(--border-default)] pt-5">
          {canRetry(sub) && (
            <div>
              <p className="text-sm fg-body">This attempt failed. If it failed before anything was sent, you can retry it.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => void act(() => api(`/submissions/${sub.id}/retry`, { method: "POST" }), "Retry queued.")}>Retry</Button>
            </div>
          )}
          {canVerify(sub) && (
            <form onSubmit={verify}>
              <label htmlFor={`live-${sub.id}`} className="text-sm font-medium fg-heading">I found it live</label>
              <p className="text-xs fg-muted">Paste the public URL of your listing and we will check it.</p>
              <div className="mt-2 flex gap-2">
                <input id={`live-${sub.id}`} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-[2px] border edge-strong bg-transparent px-3 py-2 text-sm fg-heading" />
                <Button type="submit" size="sm" variant="ink" disabled={busy}>Verify</Button>
              </div>
            </form>
          )}
        </div>
      )}

      <h3 className="t-head mt-6 border-t border-[var(--border-default)] pt-5 text-base fg-heading">Event trail</h3>
      {failed ? <p role="alert" className="fg-danger mt-3 text-sm">Could not load the trail. Close and reopen to try again.</p>
        : events === null ? <p className="fg-muted mt-3 text-sm" role="status">Loading events…</p>
        : events.length === 0 ? <p className="fg-muted mt-3 text-sm">No events recorded for this channel yet.</p>
        : (
          <ol className="mt-3 space-y-4">
            {events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-[var(--border-strong)] pl-3">
                <p className="text-sm fg-heading">{ev.message}</p>
                <p className="t-data fg-muted">{ev.kind.replaceAll("_", " ")} · {clockTime(ev.created_at)} UTC · {relativeTime(ev.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
    </>
  );
}
