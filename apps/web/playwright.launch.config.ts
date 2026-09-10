import { defineConfig } from "@playwright/test";

// Tests the deployed beta boundary, not a preview with the gates disabled.
// No paid checkout, signup or email is submitted by this suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "launch-readiness.spec.ts",
  outputDir: "/tmp/verkli-launch-readiness",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.LAUNCH_QA_URL ?? "http://127.0.0.1:3022",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    trace: "retain-on-failure",
  },
});
