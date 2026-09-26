import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { safeFetch } from "@/lib/scrape/safe-fetch";
import { POST } from "./route";

vi.mock("@/lib/scrape/safe-fetch", () => ({ safeFetch: vi.fn() }));
afterEach(() => { delete process.env.INTERNAL_VERIFY_KEY; vi.clearAllMocks(); });

it("requires an internal key and a public directory page naming the product", async () => {
  process.env.INTERNAL_VERIFY_KEY = "internal-secret";
  const request = (listing_url: string, key = "internal-secret") => new NextRequest("http://localhost/api/internal/verify-listing", {
    method: "POST", headers: { "x-internal-key": key },
    body: JSON.stringify({
      listing_url, directory_url: "https://directory.example.test",
      product_url: "https://product.example.test",
    }),
  });

  expect((await POST(request("https://directory.example.test/product", "wrong"))).status).toBe(401);
  expect((await POST(request("http://localhost/admin"))).status).toBe(422);
  vi.mocked(safeFetch).mockResolvedValue({
    url: "https://directory.example.test/product", status: 200, headers: new Headers(),
    body: 'product.example.test', chain: [],
  });
  expect((await POST(request("https://directory.example.test/product"))).status).toBe(422);
  vi.mocked(safeFetch).mockResolvedValue({
    url: "https://directory.example.test/product", status: 200, headers: new Headers(),
    body: '<a href="https://product.example.test">Product</a>', chain: [],
  });
  const response = await POST(request("https://directory.example.test/product"));
  expect(response.status).toBe(200);
  expect((await response.json()).url).toBe("https://directory.example.test/product");
});
