import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// Public landing checks do not load credentials or auth setup. Signup writes
// are mocked; the shared studio is also checked on the author landing.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["waitlist-public.spec.ts", "waitlist-experience.spec.ts", "author-experience.spec.ts"],
  outputDir: path.join(tmpdir(), "verkli-waitlist-playwright"),
  timeout: 45_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.WAITLIST_PREVIEW_URL ?? "http://127.0.0.1:3016",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});
