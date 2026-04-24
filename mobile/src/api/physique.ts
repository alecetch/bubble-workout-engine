import { authGetJson, authDeleteJson, authenticatedFetch } from "./client";

export type PhysiqueAnalysis = {
  observations: string[];
  comparison_notes: string | null;
  emphasis_suggestions: string[];
  disclaimer: string;
};

export type PhysiqueCheckIn = {
  id: string;
  submitted_at: string;
  photo_url: string | null;
  analysis: PhysiqueAnalysis | null;
  program_emphasis: string[];
};

export type CheckInListResponse = {
  ok: boolean;
  check_ins: PhysiqueCheckIn[];
};

export type CheckInSubmitResponse = {
  ok: boolean;
  check_in_id: string;
  submitted_at: string;
  analysis: PhysiqueAnalysis;
};

export async function submitCheckIn(photoUri: string): Promise<CheckInSubmitResponse> {
  const formData = new FormData();
  formData.append("photo", {
    uri: photoUri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  return authenticatedFetch<CheckInSubmitResponse>("/api/physique/check-in", {
    method: "POST",
    body: formData as unknown as Record<string, unknown>,
  });
}

export async function getCheckIns(limit = 20): Promise<CheckInListResponse> {
  return authGetJson<CheckInListResponse>(`/api/physique/check-ins?limit=${limit}`);
}

export async function deleteCheckIn(checkInId: string): Promise<{ ok: boolean }> {
  return authDeleteJson<{ ok: boolean }>(`/api/physique/check-ins/${checkInId}`);
}

export async function recordConsent(): Promise<{ ok: boolean }> {
  return authenticatedFetch<{ ok: boolean }>("/api/physique/consent", { method: "POST" });
}
