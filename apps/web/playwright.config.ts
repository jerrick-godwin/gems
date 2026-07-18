import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:4199";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  outputDir: join(tmpdir(), "gems-app-playwright-results"),
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure"
  },
  webServer: externalBaseUrl ? undefined : {
    command: "PORT=4199 npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
