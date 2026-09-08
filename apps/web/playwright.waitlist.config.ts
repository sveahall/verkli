import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// Public UI checks use mocked requests and do not load credentials or auth setup.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "waitlist-public.spec.ts",
  outputDir: path.join(tmpdir(), "verkli-waitlist-playwright"),
  timeout: 30_000,
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
