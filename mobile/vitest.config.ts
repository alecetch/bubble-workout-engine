import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "components",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Tier 2: component tests only — Tier 1 uses node:test (*.test.ts)
    include: ["src/**/*.component.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // Map react-native imports to react-native-web for DOM-compatible rendering
      "react-native": "react-native-web",
    },
  },
});
