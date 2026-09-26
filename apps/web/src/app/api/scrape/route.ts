import { NextResponse, type NextRequest } from "next/server";
import { createClient, requireUser } from "@/lib/supabase/server";
import { scrapeSite } from "@/lib/scrape";
import { toErrorResponse, ValidationError } from "@/lib/http/errors";
import { launchRateLimiter } from "@/lib/http/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { userId, fullName } = await requireUser(await createClient());
    const slot = launchRateLimiter.check(userId);
    if (!slot.allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 2048) {
      throw new ValidationError("Enter a public website URL.");
    }
    const result = await scrapeSite(body.url);
    return NextResponse.json({
      url: result.final_url,
      name: result.name,
      tagline: result.tagline ?? "",
      description: result.metadata.description ?? "",
      contact_name: fullName ?? "",
      notes: result.notes,
    });
  } catch (error) {
    return toErrorResponse(error, "POST /api/scrape");
  }
}
