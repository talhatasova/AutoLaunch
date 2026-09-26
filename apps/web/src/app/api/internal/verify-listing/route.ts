import { timingSafeEqual } from "node:crypto";
import { parse } from "node-html-parser";
import { NextResponse, type NextRequest } from "next/server";
import { safeFetch } from "@/lib/scrape/safe-fetch";
import { scraperUserAgent } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_VERIFY_KEY;
  const supplied = request.headers.get("x-internal-key") ?? "";
  if (!secret) return NextResponse.json({ error: "Verifier unavailable" }, { status: 503 });
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { listing_url, directory_url, product_url } = await request.json() as {
      listing_url: string; directory_url: string; product_url: string;
    };
    const listing = new URL(listing_url);
    const directoryHost = new URL(directory_url).hostname.replace(/^www\./, "");
    const productHost = new URL(product_url).hostname.replace(/^www\./, "");
    if (listing.protocol !== "https:" || ![
      directoryHost, `www.${directoryHost}`,
    ].some((host) => listing.hostname === host || listing.hostname.endsWith(`.${host}`))) {
      return NextResponse.json({ error: "Listing URL must be on the directory's public site" }, { status: 422 });
    }
    const result = await safeFetch(listing_url, { userAgent: scraperUserAgent(), maxBytes: 1_000_000 });
    const finalHost = new URL(result.url).hostname;
    const productLink = parse(result.body).querySelectorAll("a[href]").some((anchor) => {
      try {
        const host = new URL(anchor.getAttribute("href") ?? "", result.url).hostname.replace(/^www\./, "");
        return host === productHost || host.endsWith(`.${productHost}`);
      } catch { return false; }
    });
    if (result.status !== 200 || !(finalHost === directoryHost || finalHost.endsWith(`.${directoryHost}`)) || !productLink) {
      return NextResponse.json({ error: "Could not verify a public listing for this product" }, { status: 422 });
    }
    return NextResponse.json({ url: result.url, checked_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Could not verify that listing URL" }, { status: 422 });
  }
}
