// Recovery copy targets the final week; one-week workouts always use base volume.
export function resolveDeloadWeek(progCfg, totalWeeks) {
  const deload = progCfg?.deload;
  return deload && typeof deload === "object" && !Array.isArray(deload) && totalWeeks >= 2
    ? totalWeeks
    : null;
}
