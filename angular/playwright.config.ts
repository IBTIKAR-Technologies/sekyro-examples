// e2e of the production build (`npm run build` first, served by e2e/serve.mjs) in fixture mode: e2e/fixture-api.ts answers the sample server
// and the Sekyro AI API in the page, so no server, key or phone is needed.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4200", trace: "retain-on-failure" },
  webServer: { command: "node e2e/serve.mjs", url: "http://localhost:4200", reuseExistingServer: !process.env.CI },
  projects: [
    {
      // A phone: the flow's camera steps run on a phone (a desktop gets "continue on your phone").
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
  ],
});
