import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/unit/**",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174/Dungeon-Shop-Master/",
    browserName: "chromium",
    headless: false,
    viewport: { width: 800, height: 600 },
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    // Avoid continuous WebGL readback on software-rendered CI; capture a screenshot on failure instead.
    trace: { mode: "retain-on-failure", screenshots: false },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/Dungeon-Shop-Master/",
    reuseExistingServer: !process.env.CI,
  },
});
