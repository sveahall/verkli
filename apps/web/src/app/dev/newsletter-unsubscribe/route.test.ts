import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const url = "http://localhost/dev/newsletter-unsubscribe";
afterEach(() => vi.unstubAllEnvs());
it.each(["production", "test"])("keeps the synthetic flow unavailable in %s", async environment => {
  vi.stubEnv("NODE_ENV", environment);
  expect((await GET(new Request(url))).status).toBe(404);
  expect((await POST(new Request(url, { method: "POST" }))).status).toBe(404);
});
it("renders the real confirmation UI with explicit synthetic labeling in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const response = await GET(new Request(url));
  const html = await response.text(); expect(html).toContain("Synthetic preview only"); expect(html).toContain("Confirm unsubscribe");
});
it("supports a failed confirmation followed by an explicit retry with no database", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const request = (suffix = "") => new Request(url + suffix, { method: "POST", body: new URLSearchParams({ token: "synthetic-preview", confirm: "unsubscribe" }) });
  const failed = await POST(request("?fail=1")); expect(failed.status).toBe(500); expect(await failed.text()).toContain('action="/dev/newsletter-unsubscribe"');
  expect(await (await POST(request())).text()).toContain("You are unsubscribed");
});
