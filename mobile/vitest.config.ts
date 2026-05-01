import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "components",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.component.test.{ts,tsx}",
      "src/**/*.unit.test.{ts,tsx}",
      "src/**/__tests__/**/*.test.tsx",
    ],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: { "react-native": "react-native-web" },
  },
});
