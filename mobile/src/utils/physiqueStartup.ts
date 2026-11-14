import { PHYSIQUE_ENABLED } from "../config/features";
import { clearPendingPhysiqueUpload } from "./pendingPhysiqueUpload";

export async function clearDisabledPhysiqueUpload(): Promise<void> {
  if (!PHYSIQUE_ENABLED) await clearPendingPhysiqueUpload();
}
