import { afterEach, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

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
