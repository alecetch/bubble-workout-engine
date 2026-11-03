import { useQuery } from "@tanstack/react-query";
import { getYearRecap } from "../yearRecap";
import { useSessionStore } from "../../state/session/sessionStore";
import { deviceTimeZone } from "../../utils/localDate";

export function useYearRecap(year: number) {
  const userId = useSessionStore(state => state.userId);
  return useQuery({ queryKey: ["yearRecap", userId, year, deviceTimeZone()], queryFn: () => getYearRecap(year), enabled: Boolean(userId) });
}
