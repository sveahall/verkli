import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "illustration-insertion.spec.ts", timeout: 60_000, workers: 1,
  use: { baseURL: "http://localhost:3075", channel: "chrome", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }],
});
