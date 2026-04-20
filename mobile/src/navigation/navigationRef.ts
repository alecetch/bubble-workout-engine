import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootTabParamList } from "./AppTabs";

export const navigationRef = createNavigationContainerRef<RootTabParamList>();
