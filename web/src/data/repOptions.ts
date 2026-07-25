export const REP_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const reps = index + 1;
  return { value: String(reps), label: `${reps} rep${reps === 1 ? "" : "s"}` };
});
