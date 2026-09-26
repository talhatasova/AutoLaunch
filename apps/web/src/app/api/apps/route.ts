import { NextResponse } from "next/server";

// Retired launch-on-create endpoint. Product drafts and submissions are separate now.
export function POST() {
  return NextResponse.json({ error: "Use the reviewed product flow." }, { status: 410 });
}
