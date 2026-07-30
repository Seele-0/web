import { existsSync } from "node:fs";
import { defineConfig, devices } from "playwright/test";

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const localBrowser = process.platform === "darwin" && existsSync(macChrome) ? { launchOptions: { executablePath: macChrome } } : {};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...localBrowser } },
  ],
  webServer: {
    command: "npm run e2e:serve",
    url: "http://127.0.0.1:8788/api/bootstrap",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
