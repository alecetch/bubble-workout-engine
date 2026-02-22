// api/engine/runPipeline.js
import { buildBasicHypertrophyProgramStep } from "./steps/01_buildBasicHypertrophyProgram.js";

export async function runPipeline({ inputs, programType, request }) {
  if (programType !== "hypertrophy") {
    throw new Error(`Unsupported programType: ${programType}`);
  }

  const step1 = await buildBasicHypertrophyProgramStep({ inputs, request });

  return {
    programType,
    program: step1.program,
    debug: {
      step1: step1.debug,
    },
  };
}