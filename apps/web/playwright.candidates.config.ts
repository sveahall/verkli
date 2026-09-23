import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "illustration-candidates.spec.ts", timeout: 60_000, workers: 1,
  use: { baseURL: "http://localhost:3072", channel: "chrome", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { viewport: { width: 1280, height: 900 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }],
});
