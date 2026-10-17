import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174/Dungeon-Shop-Master/",
    browserName: "chromium",
    headless: false,
    viewport: { width: 800, height: 600 },
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/Dungeon-Shop-Master/",
    reuseExistingServer: !process.env.CI,
  },
});
