import { NextResponse } from "next/server";
import type { Tier } from "@directorylaunch/shared";
import { createClient } from "@/lib/supabase/server";
import { DatabaseError, toErrorResponse } from "@/lib/http/errors";
import type { DirectoryView } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/directories - the public catalog, as `DirectoryView[]`.
 *
 * No auth: `public.directories` has a SELECT policy for `anon` and is reference
 * data. The landing page ledger renders this, and a visitor who has not signed
 * in should still see what we cover.
 *
 * Deliberately does NOT return `form_schema` or `api_config`. Those are our
 * selector maps for other people's forms; they are operational detail, they are
 * large, and nothing in the UI renders them.
 */
export async function GET() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("directories")
      .select("slug, name, url, submission_url, tier, submission_method, requires_captcha, category, domain_rating, status")
      .order("tier", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new DatabaseError("list directories", `${error.code}: ${error.message}`);
    }

    const directories: DirectoryView[] = (data ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      url: row.url,
      submission_url: row.submission_url,
      // smallint + CHECK (tier in (1,2,3)) is what makes this cast honest.
      tier: row.tier as Tier,
      submission_method: row.submission_method,
      requires_captcha: row.requires_captcha,
      category: row.category,
      domain_rating: row.domain_rating,
      health: row.status,
    }));

    return NextResponse.json(
      { data: directories },
      // Reference data that changes when we re-verify the catalog, i.e. rarely.
      // Public, so a shared cache is safe here - unlike the launch endpoints.
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=600" } },
    );
  } catch (error) {
    return toErrorResponse(error, "GET /api/directories");
  }
}
