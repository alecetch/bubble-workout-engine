import { getAppStorage } from "./appStorage";

const REVIEW_PROMPT_KEY = "hasRequestedStoreReview";

function reviewPromptKey(userId: string): string {
  return `${REVIEW_PROMPT_KEY}:${userId}`;
}

export async function hasRequestedStoreReview(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const storage = getAppStorage();
    const already = await storage.getItem(reviewPromptKey(userId));
    return Boolean(already);
  } catch {
    return false;
  }
}

export async function markStoreReviewRequested(userId: string | undefined): Promise<void> {
  if (!userId) return;
  try {
    await getAppStorage().setItem(reviewPromptKey(userId), "true");
  } catch {
    // Review prompt persistence is best-effort only.
  }
}
