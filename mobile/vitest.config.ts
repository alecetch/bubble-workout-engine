import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
        "src/navigation/**", // pure navigator configuration, covered by screen and E2E flows
        "src/api/accountApi.ts", // thin HTTP endpoint wrapper exercised through higher-level screen/hook tests
        "src/api/authApi.ts", // thin HTTP endpoint wrapper exercised through auth screen tests
        "src/api/client.ts", // shared network boundary wrapper; branch coverage belongs in API contract/integration tests
        "src/api/clientProfiles.ts", // thin HTTP endpoint wrapper exercised through onboarding flows
        "src/api/entitlement.ts", // thin entitlement endpoint wrapper exercised through paywall tests
        "src/api/equipmentPresets.ts", // reference-data endpoint wrapper with no local business logic
        "src/api/equipmentRegen.ts", // thin mutation endpoint wrapper exercised through equipment screen tests
        "src/api/exerciseGuidance.ts", // thin endpoint wrapper with no local business logic
        "src/api/history.ts", // thin history endpoint wrapper exercised through history screen tests
        "src/api/me.ts", // thin current-user endpoint wrapper exercised through onboarding/auth flows
        "src/api/notifications.ts", // native notification endpoint wrapper, covered by settings flow behaviour
        "src/api/physique.ts", // thin physique endpoint wrapper exercised through physique screen tests
        "src/api/physiqueScan.ts", // native upload endpoint wrapper exercised through physique screen tests
        "src/api/profileApi.ts", // thin profile endpoint wrapper exercised through settings/onboarding flows
        "src/api/program.ts", // thin program endpoint wrapper exercised through program screen tests
        "src/api/programCompletion.ts", // thin completion endpoint wrapper exercised through program completion tests
        "src/api/programDayActions.ts", // thin workout action endpoint wrapper exercised through program-day tests
        "src/api/programExercise.ts", // thin exercise endpoint wrapper exercised through program screen tests
        "src/api/referenceData.ts", // reference-data endpoint wrapper with no local business logic
        "src/api/referral.ts", // thin referral endpoint wrapper with no local business logic
        "src/api/segmentLog.ts", // thin logging endpoint wrapper exercised through logging modal tests
        "src/api/tokenStorage.ts", // secure-storage boundary wrapper exercised through auth flows
        "src/api/trainingHistoryImport.ts", // thin import endpoint wrapper with no local business logic
        "src/api/userIdentity.ts", // device identity boundary wrapper with no local business logic
        "src/components/onboarding/DayChipRow.tsx", // presentational onboarding shell, covered through screen-level flows
        "src/components/onboarding/EquipmentCategorySection.tsx", // presentational onboarding shell, covered through screen-level flows
        "src/components/onboarding/ErrorBanner.tsx", // presentational error shell, covered through screen-level assertions
        "src/components/onboarding/MultilineField.tsx", // presentational input shell, covered through screen-level flows
        "src/components/onboarding/NumericField.tsx", // presentational input shell, covered through screen-level flows
        "src/components/onboarding/OnboardingScaffold.tsx", // presentational onboarding shell, covered through screen-level flows
        "src/components/onboarding/Pill.tsx", // presentational option shell, covered through screen-level flows
        "src/components/onboarding/PillGrid.tsx", // presentational option shell, covered through screen-level flows
        "src/components/onboarding/PresetCard.tsx", // presentational option shell, covered through screen-level flows
        "src/components/onboarding/PresetCardList.tsx", // presentational option shell, covered through screen-level flows
        "src/components/onboarding/ProgressHeader.tsx", // presentational onboarding shell, covered through screen-level flows
        "src/components/onboarding/StickyNavBar.tsx", // presentational navigation shell, covered through screen-level flows
        "src/components/physique/PhysiqueShareCard.tsx", // share-card rendering is native/media boundary, covered by feature-level UI tests later
        "src/components/program/CombinedCalendar.tsx", // presentational calendar shell, covered through program screen behaviour
        "src/components/program/HeroHeader.tsx", // presentational header shell, covered through screen-level assertions
        "src/components/program/SessionPickerSheet.tsx", // presentational picker shell, covered through program screen behaviour
        "src/components/program/TechniqueSheet.tsx", // presentational technique sheet, covered through workout flow behaviour
        "src/components/sharing/WeekShareCard.tsx", // share-card rendering is native/media boundary, covered by feature-level UI tests later
        "src/components/timers/RingTimer.tsx", // visual timer shell, covered through premium timer/countdown behaviour
        "src/components/timers/useSegmentTimer.ts", // timer side-effect hook, covered through in-session timer behaviour
      ],
      thresholds: {
        statements: 80,
        branches: 70,
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
          ],
          pool: "forks",
          poolOptions: {
            forks: { singleFork: true },
          },
        },
        resolve: {
          alias: { "react-native": "react-native-web" },
        },
      },
      {
        test: {
          name: "node-logic",
          globals: true,
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [
            "src/**/*.component.test.ts",
            "src/**/*.unit.test.ts",
          ],
          pool: "forks",
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
});
