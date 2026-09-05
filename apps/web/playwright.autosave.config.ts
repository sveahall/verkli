import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Deliberately independent of playwright.config.ts: no env loading, auth setup,
// storage state, Next server, or existing localhost service is used by this suite.
export default defineConfig({
  testDir: "./tests/e2e/autosave",
  testMatch: "*.spec.ts",
  outputDir: path.join(os.tmpdir(), `verkli-autosave-results-${process.pid}`),
  timeout: 20_000,
  workers: 1,
  retries: 0,
  use: { browserName: "chromium", headless: true, serviceWorkers: "block" },
});
