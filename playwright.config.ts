import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/frontend/browser",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", headless: true },
});
