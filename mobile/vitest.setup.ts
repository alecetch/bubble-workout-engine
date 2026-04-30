import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import React from "react";

// Ensure DOM is cleaned up between every test. @testing-library/react registers
// this automatically when globals are detected, but it does not fire reliably
// under vitest's forks pool with singleFork:true — so we wire it explicitly.
afterEach(() => {
  cleanup();
});

// ── jsdom polyfills ───────────────────────────────────────────────────────────

// react-native-web uses window.matchMedia for colour-scheme detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// react-native-web may use ResizeObserver for layout measurements
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Silence expected react-native-web console noise in test output
const originalWarn = console.warn.bind(console);
console.warn = (msg: unknown, ...args: unknown[]) => {
  if (
    typeof msg === "string" &&
    (msg.includes("YellowBox") ||
      msg.includes("ReactTestUtils") ||
      msg.includes("act(...)"))
  )
    return;
  originalWarn(msg, ...args);
};

// ── Expo modules ──────────────────────────────────────────────────────────────

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, size, color }: { name: string; size?: number; color?: string }) =>
    React.createElement("span", { "data-icon": name, "data-size": size, "data-color": color }),
  MaterialIcons: ({ name, size, color }: { name: string; size?: number; color?: string }) =>
    React.createElement("span", { "data-icon": name, "data-size": size, "data-color": color }),
  MaterialCommunityIcons: ({ name, size, color }: { name: string; size?: number; color?: string }) =>
    React.createElement("span", { "data-icon": name, "data-size": size, "data-color": color }),
}));

vi.mock("expo-linking", () => ({
  createURL: (path: string) => `exp://localhost/${path}`,
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  openURL: vi.fn(),
  canOpenURL: vi.fn().mockResolvedValue(true),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { name: "test-app", slug: "test-app" },
    sessionId: "test-session",
    executionEnvironment: "storeClient",
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: "undetermined" }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  getExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: "ExponentPushToken[test]" }),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  setNotificationHandler: vi.fn(),
  AndroidImportance: { MAX: 5 },
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  selectionAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

vi.mock("expo-file-system", () => ({
  documentDirectory: "/test/documents/",
  cacheDirectory: "/test/cache/",
  readAsStringAsync: vi.fn().mockResolvedValue(""),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false, isDirectory: false }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  copyAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-asset", () => ({
  Asset: {
    fromModule: vi.fn().mockReturnValue({ downloadAsync: vi.fn(), localUri: null }),
    loadAsync: vi.fn().mockResolvedValue([]),
  },
}));

// ── React Navigation ──────────────────────────────────────────────────────────

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    reset: vi.fn(),
    setOptions: vi.fn(),
    canGoBack: vi.fn(() => true),
    dispatch: vi.fn(),
  }),
  useRoute: () => ({ params: {}, key: "test-route", name: "TestScreen" }),
  useFocusEffect: vi.fn((cb: () => (() => void) | void) => {
    cb();
  }),
  useIsFocused: vi.fn(() => true),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  createNavigatorFactory: vi.fn(),
}));

vi.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: vi.fn(() => ({
    Navigator: ({ children }: { children: React.ReactNode }) => (
      React.createElement(React.Fragment, null, children)
    ),
    Screen: () => null,
  })),
}));

vi.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: vi.fn(() => ({
    Navigator: ({ children }: { children: React.ReactNode }) => (
      React.createElement(React.Fragment, null, children)
    ),
    Screen: () => null,
  })),
}));

// ── Animation & gesture libraries ─────────────────────────────────────────────

vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children: React.ReactNode }) => (
      React.createElement("div", null, children)
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      React.createElement("span", null, children)
    ),
    Image: ({ children }: { children?: React.ReactNode }) => (
      React.createElement("img", null, children ?? null)
    ),
    createAnimatedComponent: (c: unknown) => c,
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    timing: vi.fn(),
    spring: vi.fn(),
    event: vi.fn(),
    add: vi.fn(),
    multiply: vi.fn(),
  },
  useSharedValue: vi.fn((v: unknown) => ({ value: v })),
  useAnimatedStyle: vi.fn((fn: () => unknown) => fn()),
  useAnimatedScrollHandler: vi.fn(() => vi.fn()),
  useDerivedValue: vi.fn((fn: () => unknown) => ({ value: fn() })),
  withTiming: vi.fn((v: unknown) => v),
  withSpring: vi.fn((v: unknown) => v),
  withDelay: vi.fn((_: number, v: unknown) => v),
  withSequence: vi.fn((...args: unknown[]) => args[args.length - 1]),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  Easing: {
    out: vi.fn((f: unknown) => f),
    in: vi.fn((f: unknown) => f),
    inOut: vi.fn((f: unknown) => f),
    linear: vi.fn(),
    ease: vi.fn(),
    bezier: vi.fn(),
  },
  FadeIn: { duration: vi.fn().mockReturnThis(), delay: vi.fn().mockReturnThis() },
  FadeOut: { duration: vi.fn().mockReturnThis() },
  SlideInRight: { duration: vi.fn().mockReturnThis() },
}));

vi.mock("react-native-worklets", () => ({
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  useWorklet: vi.fn(),
  Worklets: { createRunInContextFn: vi.fn() },
}));

vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  Gesture: {
    Tap: vi.fn(() => ({ onEnd: vi.fn().mockReturnThis(), onStart: vi.fn().mockReturnThis() })),
    Pan: vi.fn(() => ({
      onUpdate: vi.fn().mockReturnThis(),
      onEnd: vi.fn().mockReturnThis(),
      minDistance: vi.fn().mockReturnThis(),
    })),
    Simultaneous: vi.fn(),
    Race: vi.fn(),
    Exclusive: vi.fn(),
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  PanGestureHandler: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  State: { BEGAN: 2, ACTIVE: 4, END: 5, FAILED: 1, CANCELLED: 3 },
}));

vi.mock("react-native-svg", () => {
  const stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children ?? null);
  return {
    default: stub,
    Svg: stub,
    Circle: () => null,
    Line: () => null,
    Path: () => null,
    Rect: () => null,
    Polygon: () => null,
    Polyline: () => null,
    G: stub,
    Text: stub,
    TSpan: stub,
    Defs: stub,
    ClipPath: stub,
    LinearGradient: stub,
    Stop: () => null,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  useSafeAreaInsets: vi.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
  useSafeAreaFrame: vi.fn(() => ({ x: 0, y: 0, width: 375, height: 812 })),
  initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } },
}));

vi.mock("react-native-screens", () => ({
  enableScreens: vi.fn(),
  Screen: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
  ScreenContainer: ({ children }: { children: React.ReactNode }) => (
    React.createElement(React.Fragment, null, children)
  ),
}));

vi.mock("react-native-view-shot", () => ({
  captureRef: vi.fn().mockResolvedValue("/tmp/test-capture.png"),
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children ?? null),
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(false),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

// ── Data fetching ─────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
      getQueryData: vi.fn(() => undefined),
      removeQueries: vi.fn(),
    })),
  };
});
