import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// BASE_PATH is "/plantline/" on GitHub Pages (set by the workflow) and "/" everywhere else.
export default defineConfig({
    base: process.env.BASE_PATH ?? "/",
    plugins: [react()],
    worker: { format: "es" },
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
