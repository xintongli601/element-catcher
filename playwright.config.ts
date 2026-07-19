import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-results.json" }]
  ],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
