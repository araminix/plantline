import { defineConfig, devices } from "@playwright/test";

// The tests run against the production build (with the CAD reader in public/cad: run `pnpm cad` first)
export default defineConfig({
    testDir: "e2e",
    timeout: 90_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
    webServer: {
        command: "pnpm build && pnpm preview --port 4173 --strictPort",
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "phone", use: { ...devices["Pixel 7"] } },
    ],
});
