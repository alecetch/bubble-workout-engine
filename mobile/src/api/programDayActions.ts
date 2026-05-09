import { authGetJson, authPostJson } from "./client";

export async function skipProgramDay(
  programId: string,
  programDayId: string,
  reason?: string,
): Promise<void> {
  await authPostJson<unknown, { reason?: string }>(
    `/api/programs/${encodeURIComponent(programId)}/days/${encodeURIComponent(programDayId)}/skip`,
    reason ? { reason } : {},
  );
}

export async function rescheduleProgramDay(
  programId: string,
  programDayId: string,
  targetDate: string,
): Promise<void> {
  await authPostJson<unknown, { targetDate: string }>(
    `/api/programs/${encodeURIComponent(programId)}/days/${encodeURIComponent(programDayId)}/reschedule`,
    { targetDate },
  );
}

export type SubstitutionJobStatus = {
  status: "running" | "complete" | "partial" | "failed";
  swappedCount?: number;
  warnings?: Array<{ programExerciseId: string; exerciseId: string }>;
  unsubstitutedExerciseIds?: string[];
  error?: string | null;
};

export async function startEquipmentSubstitution(
  programId: string,
  availableEquipmentCodes: string[],
): Promise<{ jobId: string }> {
  const raw = await authPostJson<{ ok: boolean; jobId: string }, { availableEquipmentCodes: string[] }>(
    `/api/programs/${encodeURIComponent(programId)}/equipment-substitution`,
    { availableEquipmentCodes },
  );
  return { jobId: raw.jobId };
}

export async function pollSubstitutionJob(
  programId: string,
  jobId: string,
): Promise<SubstitutionJobStatus> {
  return authGetJson<SubstitutionJobStatus>(
    `/api/programs/${encodeURIComponent(programId)}/equipment-substitution/${encodeURIComponent(jobId)}`,
  );
}
