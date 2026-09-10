import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { tmpdir } from "node:os";
import path from "node:path";

loadEnv({ path: path.join(__dirname, ".env.local") });
const hasFixture = Boolean(process.env.E2E_AUTHOR_EMAIL && process.env.E2E_AUTHOR_PASSWORD);

// Run against an already-started preview. Existing fixture login is reused;
// feature flags and production services are never changed by this config.
export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(tmpdir(), "verkli-details-playwright"),
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.UI_DETAILS_PREVIEW_URL ?? "http://127.0.0.1:3021",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "public", testMatch: ["ui-details.spec.ts", "brand-shell.spec.ts", "author-experience.spec.ts", "waitlist-public.spec.ts", "waitlist-experience.spec.ts"] },
    ...(hasFixture ? [
      { name: "setup", testMatch: "auth.setup.ts" },
      { name: "authed", dependencies: ["setup"], testMatch: ["ui-details.authed.spec.ts", "author-control-details.authed.spec.ts", "import-campaign-details.authed.spec.ts", "command-palette.authed.spec.ts"], use: { storageState: "e2e/.auth/author.json" } },
    ] : []),
  ],
});
