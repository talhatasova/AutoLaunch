import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductWorkbench } from "./product-workbench";
import { DirectoryCatalog } from "./directory-catalog";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) redirect("/auth/sign-in");

  const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("API_INTERNAL_URL or NEXT_PUBLIC_API_URL is required");
  const headers = { Authorization: `Bearer ${sessionData.session.access_token}` };
  const [productResponse, directoryResponse, analyticsResponse] = await Promise.all([
    fetch(`${apiUrl}/api/v1/products`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/api/v1/directories`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/api/v1/analytics`, { headers, cache: "no-store" }),
  ]);
  if (productResponse.status === 401 || directoryResponse.status === 401 || analyticsResponse.status === 401) redirect("/auth/sign-in");
  if (!productResponse.ok || !directoryResponse.ok || !analyticsResponse.ok) throw new Error("Could not load the workspace");
  const [products, directories, analytics] = await Promise.all([productResponse.json(), directoryResponse.json(), analyticsResponse.json()]);

  return (
    <main className="shell min-h-[70dvh] py-16">
      <p className="t-micro fg-accent">Your workspace</p>
      <h1 className="t-display-sm fg-heading mt-5">Products</h1>
      <p className="fg-muted mt-4">Review each product before choosing directory targets.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {([
          ["Submissions", analytics.total],
          ["Awaiting review", analytics.counts.pending_review],
          ["Verified live", analytics.counts.live],
        ] as const).map(([label, count]) => (
          <div key={label} className="edge-heavy-t py-5">
            <p className="t-micro fg-muted">{label}</p>
            <p className="t-display-sm fg-heading mt-2">{count}</p>
          </div>
        ))}
      </div>
      <ProductWorkbench initialProducts={products} directories={directories} contactEmail={userData.user.email ?? ""} />
      <section aria-label="Outcomes by directory" className="mt-16 edge-heavy-t pt-5">
        <h2 className="t-meta fg-heading">Outcomes by directory</h2>
        {analytics.by_directory.length === 0 ? <p className="fg-muted mt-4">No submissions yet.</p> : analytics.by_directory.map((item: { directory_id: string; name: string; total: number; live: number; pending_review: number; unconfirmed: number; failed: number }) => (
          <p key={item.directory_id} className="fg-body edge-t mt-4 py-3">{item.name}: {item.total} submitted · {item.pending_review} in review · {item.live} live · {item.unconfirmed} unconfirmed · {item.failed} failed</p>
        ))}
      </section>
      <DirectoryCatalog directories={directories} />
    </main>
  );
}
