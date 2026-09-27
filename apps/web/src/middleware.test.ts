import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { middleware } from "./middleware";

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn(() => NextResponse.next()) }));

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_MARKETING_URL;
});

it("keeps the marketing and application entry points on their own hosts", async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.NEXT_PUBLIC_MARKETING_URL = "https://example.test";

  const app = await middleware(new NextRequest("https://app.example.test/"));
  expect(app.headers.get("location")).toBe("https://app.example.test/dashboard");

  const auth = await middleware(new NextRequest("https://example.test/auth/sign-in?next=%2Fdashboard"));
  expect(auth.headers.get("location")).toBe(
    "https://app.example.test/auth/sign-in?next=%2Fdashboard",
  );
});

it("serves the landing page when a preview uses one host", async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.test";
  process.env.NEXT_PUBLIC_MARKETING_URL = "https://preview.example.test";

  const landing = await middleware(new NextRequest("https://preview.example.test/"));
  expect(landing.headers.get("location")).toBeNull();

  const signIn = await middleware(new NextRequest("https://preview.example.test/auth/sign-in"));
  expect(signIn.headers.get("location")).toBeNull();
});
