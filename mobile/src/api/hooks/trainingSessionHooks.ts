import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteOutsideSession, getOutsideSessions, logOutsideSession } from "../trainingSessions";
import { queryKeys } from "./shared";

export const outsideSessionsKey = ["outsideSessions"] as const;
export function useOutsideSessions(year?: number, userId?: string) {
  return useQuery({ queryKey: [...outsideSessionsKey, userId, year], queryFn: () => getOutsideSessions(year), enabled: Boolean(userId) });
}
function useInvalidateOutsideSessions() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.yearProgress }),
      client.invalidateQueries({ queryKey: outsideSessionsKey }),
    ]);
  };
}
export function useLogOutsideSession() {
  const invalidate = useInvalidateOutsideSessions();
  return useMutation({ mutationFn: logOutsideSession, onSuccess: invalidate });
}
export function useDeleteOutsideSession() {
  const invalidate = useInvalidateOutsideSessions();
  return useMutation({ mutationFn: deleteOutsideSession, onSuccess: invalidate });
}
