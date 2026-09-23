import { defineConfig } from "@playwright/test";
export default defineConfig({
  // Each scenario crosses several server-rendered pages on the shared local dev host.
  testDir: "./e2e", testMatch: "illustration-picker.spec.ts", timeout: 120_000, workers: 1,
  use: { baseURL: "http://localhost:3073", channel: "chrome", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { viewport: { width: 1280, height: 900 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }],
});
