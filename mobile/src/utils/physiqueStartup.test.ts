import { beforeEach, expect, it, vi } from "vitest";
import { clearDisabledPhysiqueUpload } from "./physiqueStartup";
import { clearPendingPhysiqueUpload } from "./pendingPhysiqueUpload";
const flags = vi.hoisted(() => ({ PHYSIQUE_ENABLED: false }));
vi.mock("../config/features", () => flags);
vi.mock("./pendingPhysiqueUpload", () => ({ clearPendingPhysiqueUpload: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });
it("clears the old queued URI during disabled-feature startup", async () => {
  flags.PHYSIQUE_ENABLED = false;
  await clearDisabledPhysiqueUpload();
  expect(clearPendingPhysiqueUpload).toHaveBeenCalledTimes(1);
});
it("leaves the queue available when the build enables physique", async () => {
  flags.PHYSIQUE_ENABLED = true;
  await clearDisabledPhysiqueUpload();
  expect(clearPendingPhysiqueUpload).not.toHaveBeenCalled();
});
