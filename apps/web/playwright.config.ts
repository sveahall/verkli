import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Playwright does not read .env.local on its own, so the auth setup project
// found no credentials and skipped — which then failed every authenticated
// spec with a missing storage-state file rather than a readable reason.
loadEnv({ path: path.join(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      ...process.env,
      PORT: "3000",
      DONATION_CHECKOUT_MOCK_MODE: "true",
      STRIPE_SECRET_KEY: "",
    },
  },
  projects: [
    // Signs in once and writes e2e/.auth/author.json. Everything authenticated
    // depends on this, so it runs first and only once.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { browserName: "chromium" },
    },
    // Unauthenticated specs. Kept separate so they still run when no fixture
    // credentials exist — a contributor without them loses the authed suite,
    // not the whole suite.
    {
      name: "chromium",
      testIgnore: [/auth\.setup\.ts/, /\.authed\.spec\.ts/],
      use: { browserName: "chromium" },
    },
    {
      name: "authed",
      testMatch: /\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/author.json",
      },
    },
  ],
});
