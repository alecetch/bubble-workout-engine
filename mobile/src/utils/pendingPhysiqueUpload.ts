import { getAppStorage } from "./appStorage";

const KEY = "pendingPhysiqueCheckIn";

export async function setPendingPhysiqueUpload(photoUri: string): Promise<void> {
  await getAppStorage().setItem(KEY, photoUri);
}

export async function getPendingPhysiqueUpload(): Promise<string | null> {
  return getAppStorage().getItem(KEY);
}

export async function clearPendingPhysiqueUpload(): Promise<void> {
  await getAppStorage().removeItem(KEY);
}
