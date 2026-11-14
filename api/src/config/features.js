export function isPhysiqueEnabled(env = process.env) {
  return env.PHYSIQUE_ENABLED === "true";
}
