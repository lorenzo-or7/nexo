import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PW_CHROMIUM_PATH; // opcional: Chromium do sistema
const launchOptions = executablePath ? { executablePath, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: "smartphone", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3100", url: "http://localhost:3100/entrar", reuseExistingServer: true, timeout: 180_000 },
});
