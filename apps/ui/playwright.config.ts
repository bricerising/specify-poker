import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)
  || process.env.PLAYWRIGHT_EXTERNAL === "1";
const runAllBrowsers = process.env.PLAYWRIGHT_ALL_BROWSERS === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !useExternalServer,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : useExternalServer ? 1 : undefined,
  reporter: "html",
  globalSetup: useExternalServer ? "./tests/e2e/globalSetup.ts" : undefined,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: runAllBrowsers || !useExternalServer
    ? [
      {
        name: "chromium",
        use: { ...devices["Desktop Chrome"] },
      },
      {
        name: "firefox",
        use: { ...devices["Desktop Firefox"] },
      },
      {
        name: "webkit",
        use: { ...devices["Desktop Safari"] },
      },
    ]
    : [
      {
        name: "chromium",
        use: { ...devices["Desktop Chrome"] },
      },
    ],
  webServer: useExternalServer
    ? undefined
    : {
      command: "npm run start",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
});
