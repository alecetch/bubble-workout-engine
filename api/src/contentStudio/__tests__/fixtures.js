export function athleteRows({ winnerStrongStation = false, sledDecides = false } = {}) {
  return Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const runBase = 250 + index * 10;
    const stationBase = winnerStrongStation ? 210 + index * 8 : index === 0 ? 310 : 220 + index * 8;
    const sledOffset = sledDecides ? index * 15 : (9 - index) * 10;
    const splits = {
      run_1: runBase,
      skierg: stationBase,
      run_2: runBase + 4,
      sled_push: stationBase + sledOffset,
      run_3: runBase + 8,
      sled_pull: stationBase + sledOffset + 6,
      run_4: runBase + 12,
      burpee_bj: stationBase + 24,
      run_5: runBase + 16,
      row: stationBase + 12,
      run_6: runBase + 20,
      farmers_carry: stationBase + 18,
      run_7: runBase + 24,
      sandbag_lunge: stationBase + 30,
      run_8: runBase + 28,
      wall_balls: stationBase + index * 18,
    };
    const splitTotal = Object.values(splits).reduce((sum, value) => sum + value, 0);
    return {
      rank,
      name: `Athlete ${rank}`,
      instagramHandle: `@athlete${rank}`,
      finishTimeSeconds: index === 0 ? splitTotal - 500 : splitTotal + 120 + index * 5,
      roxzoneSeconds: 120,
      splits,
      division: "open",
      sex: "male",
    };
  });
}

export const mockBenchmarkPool = {
  async query() {
    return { rows: [] };
  },
};
