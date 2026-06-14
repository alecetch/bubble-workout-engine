export const ACTION_MAP = Object.freeze({
  wall_ball_capacity: "Build density and breathing control under fatigue",
  compromised_running: "Practise running after sleds, burpees and lunges",
  roxzone_rehearsal: "Rehearse station entry and exit transitions",
  sled_technique: "Improve body position and step rhythm",
  grip_carry_specificity: "Add loaded carries and grip endurance",
  lunge_strength_endurance: "Build unilateral endurance and trunk control",
  burpee_rhythm: "Improve repeatable cadence and landing mechanics",
  ski_efficiency: "Improve stroke rhythm; avoid early over-pacing",
  row_efficiency: "Improve pacing and stroke mechanics",
  run_volume_base: "Gradually increase aerobic volume where safe",
  race_pacing: "Start controlled; protect late-race running",
  maintain_taper: "Keep sharpness; avoid new load",
});

export const VOLUME_INCREASING_ACTIONS = Object.freeze(new Set([
  "run_volume_base",
  "wall_ball_capacity",
  "compromised_running",
  "lunge_strength_endurance",
  "grip_carry_specificity",
]));
