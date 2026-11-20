import { useQuery } from "@tanstack/react-query";
import { getPreferredUnit } from "../profileApi";
import type { WeightUnit } from "../../utils/trainingWeight";
export function useWeightUnit(): WeightUnit {
  const query = useQuery({ queryKey: ["preferredUnit"], queryFn: getPreferredUnit, staleTime: 30 * 60 * 1000 });
  return !query.isError && !query.isPending && query.data === "lbs" ? "lbs" : "kg";
}
