import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./qa/tests",
  outputDir: "./qa/artifacts/playwright-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "qa/artifacts/playwright-results.json" }],
    ["html", { outputFolder: "qa/artifacts/playwright-report", open: "never" }],
  ],
  use: {
    baseURL:
      process.env.QA_BASE_URL ??
      "https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site",
    browserName: "chromium",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
