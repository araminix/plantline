import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { withTileOrigins } from "./src/layout/tiles";

// BASE_PATH is "/plantline/" on GitHub Pages (set by the workflow) and "/" everywhere else.
export default defineConfig({
    base: process.env.BASE_PATH ?? "/",
    // The map's tile servers go into the page's Content Security Policy from src/layout/tiles.ts
    plugins: [react(), { name: "tile-origins", transformIndexHtml: (html) => withTileOrigins(html) }],
    worker: { format: "es" },
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
