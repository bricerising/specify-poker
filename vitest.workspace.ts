import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // UI app - needs jsdom environment for browser APIs
  {
    extends: "./apps/ui/vitest.config.ts",
    test: {
      name: "ui",
      root: "./apps/ui",
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
    },
  },
  // All other apps - use node environment
  {
    test: {
      name: "backend",
      include: [
        "apps/!(ui)/**/*.test.ts",
        "packages/**/*.test.ts",
      ],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  },
]);
