import { fetchInputs } from "../bubbleClient.js";

export async function generatePlan({ clientProfileId, programType = "hypertrophy" }) {
  const inputs = await fetchInputs({ clientProfileId });

  return {
    programType,
    generatedAt: new Date().toISOString(),
    bubble: {
      clientProfileId: inputs?.clientProfile?.response?._id ?? null,
      exerciseCount: inputs?.exercises?.response?.results?.length ?? 0,
    },
    weeks: []
  };
}