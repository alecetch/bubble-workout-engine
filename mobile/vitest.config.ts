import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentryReactNativeMock = resolve(__dirname, "src/test/sentryReactNativeMock.ts");

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "babel.config.cjs", // build-tool config, not runtime application logic
        "vitest.config.ts", // test-runner config, not runtime application logic
        ".maestro/scripts/**", // Maestro helper scripts are covered by E2E flow execution, not unit coverage
        "App.tsx", // app bootstrap/native provider wiring, not isolated business logic
        "scripts/**", // local maintenance helpers, not shipped mobile runtime code
        "src/navigation/*Navigator.tsx", // Native stack/container configuration; exercised by native E2E flows
        "src/navigation/AppTabs.tsx", // Native tab navigation configuration
        "src/navigation/navigationRef.ts", // Native navigation-container ref; routing decisions are measured separately

        "src/api/tokenStorage.ts", // Native SecureStore adapter; auth/refresh logic is measured in client.ts
        "src/api/__fixtures__/**", // static JSON fixture data loaded by MSW handlers; not executable application code
        // Native rendering/device boundaries; mocked calls do not verify hardware behavior
        "src/components/sharing/PRShareCard.tsx", // share-card rendering is native/media boundary; tested via E2E screenshot flows
        "src/components/physique/PhysiqueShareCard.tsx", // physique share-card at native screenshot boundary
        "src/components/interaction/usePressScale.ts", // animation hook using Reanimated worklets; no testable business logic
        "src/components/interaction/haptics.ts", // Native haptic feedback adapter; hardware behavior requires a device
        "src/components/program/HeroHeader.tsx", // Reanimated + expo-linear-gradient animation component; animation worklet boundary
        "src/components/sharing/WeekShareCard.tsx", // share-card rendering is native/media boundary, covered by feature-level UI tests later
        "src/components/timers/RingTimer.tsx", // Native SVG renderer; timer state and hook logic are measured
        "src/utils/reduceMotion.ts", // Native accessibility preference adapter; system behavior requires a device
        "src/utils/shareCard.ts", // Native screenshot/share adapter; capture and OS share sheet require a device
        // Screens with native camera/share integration, plus the explicitly retained workout-screen gap
        "src/screens/physique/PhysiqueCheckInScreen.tsx", // Native camera/image picker and share/render integration; physical-device/E2E evidence required
        "src/screens/physique/PhysiqueIntelligenceScreen.tsx", // Native camera/image picker and share/render integration; physical-device/E2E evidence required
        "src/screens/program/ProgramDayScreen.tsx", // Known gap: thin screen test; native workout/timer/gesture flow needs broader coverage
      ],
      thresholds: {
        // Ratcheted from the full suite after removing false exclusions.
        // Each threshold is floor(measured percentage - 1).
        statements: 80,
        branches: 73,
        functions: 78,
      },
    },
    projects: [
      {
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
            "src/navigation/*.test.tsx",
          ],
        },
        resolve: {
          alias: { "react-native": "react-native-web", "@sentry/react-native": sentryReactNativeMock },
        },
      },
      {
        test: {
          name: "node-logic",
          setupFiles: ["./vitest.node.setup.ts"],
          globals: true,
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [
            "src/**/*.component.test.ts",
            "src/**/*.unit.test.ts",
          ],
        },
        resolve: {
          alias: { "@sentry/react-native": sentryReactNativeMock },
        },
      },
    ],
  },
});
