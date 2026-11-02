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
    // Keep diagnostics from delaying render-sensitive checks; capture the scene on failure instead.
    trace: { mode: "retain-on-failure", snapshots: false, screenshots: false },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/Dungeon-Shop-Master/",
    reuseExistingServer: !process.env.CI,
  },
});
