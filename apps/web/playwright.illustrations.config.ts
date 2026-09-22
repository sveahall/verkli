import { defineConfig } from "@playwright/test";

// Run against the local dev fixture. No auth setup or .env files are loaded.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "book-illustrations.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3071",
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
