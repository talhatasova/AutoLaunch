import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";
import type { CatalogDirectory, Dashboard, Me, Product } from "./types";
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
  const get = (path: string) => fetch(`${apiUrl}/api/v1${path}`, { headers, cache: "no-store" });
  const responses = await Promise.all([get("/me"), get("/dashboard"), get("/directories"), get("/products")]);
  if (responses.some((response) => response.status === 401)) redirect("/auth/sign-in");
  if (responses.some((response) => !response.ok)) throw new Error("Could not load the workspace");
  const [me, dashboard, directories, products] = (await Promise.all(responses.map((response) => response.json()))) as [Me, Dashboard, CatalogDirectory[], Product[]];

  return (
    <main className="shell min-h-[70dvh] py-10 md:py-14">
      <DashboardClient me={me} dashboard={dashboard} directories={directories} products={products} />
    </main>
  );
}
