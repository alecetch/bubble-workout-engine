import { getPersistentStorage, type StorageLike } from "./persistentStorage";

export function getAppStorage(): StorageLike {
  return getPersistentStorage();
}
