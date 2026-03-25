import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      ...process.env,
      PORT: "3100",
      DONATION_CHECKOUT_MOCK_MODE: "true",
      STRIPE_SECRET_KEY: "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
