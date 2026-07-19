export const MUSCLE_GROUP_LABELS = Object.freeze({
  posterior_chain: "Posterior chain",
  quad_dominant: "Quad-dominant",
  upper_back_pull: "Upper back / pull",
  push_shoulder: "Push / shoulder",
  core_stability: "Core / stability",
  grip_forearm: "Grip / forearm",
});

export const MUSCLE_GROUP_MAP = Object.freeze([
  { segmentKey: "ski_erg", primary: ["upper_back_pull", "core_stability"], secondary: ["push_shoulder", "posterior_chain"] },
  { segmentKey: "sled_push", primary: ["quad_dominant", "posterior_chain"], secondary: ["push_shoulder", "core_stability"] },
  { segmentKey: "sled_pull", primary: ["posterior_chain", "upper_back_pull"], secondary: ["grip_forearm", "core_stability"] },
  { segmentKey: "burpee_broad_jump", primary: ["posterior_chain", "push_shoulder"], secondary: ["quad_dominant", "core_stability"] },
  { segmentKey: "row", primary: ["upper_back_pull", "quad_dominant"], secondary: ["grip_forearm", "core_stability"] },
  { segmentKey: "farmers_carry", primary: ["grip_forearm", "core_stability"], secondary: ["upper_back_pull", "posterior_chain"] },
  { segmentKey: "sandbag_lunges", primary: ["quad_dominant", "posterior_chain"], secondary: ["core_stability", "upper_back_pull"] },
  { segmentKey: "wall_balls", primary: ["quad_dominant", "push_shoulder"], secondary: ["core_stability", "posterior_chain"] },
]);

export const TRAINING_HINTS = Object.freeze({
  upper_back_pull: "Lat pull-downs, cable rows, and inverted rows under fatigue will build the specific pulling endurance these stations demand.",
  posterior_chain: "Romanian deadlifts, hip thrusts, and Nordic curls build the posterior-chain strength-endurance these stations demand.",
  quad_dominant: "Front squats, step-ups, and sled-specific loading build the quad durability these stations demand.",
  push_shoulder: "Overhead press, dumbbell chest-to-floor press, and push-up conditioning under fatigue build the shoulder durability these stations demand.",
  core_stability: "Anti-rotation planks, Pallof press, and loaded carry intervals build the postural endurance that underpins every station.",
  grip_forearm: "Carry progressions, dead hangs, and high-rep farmer walks build the grip endurance that becomes the limiting factor under race fatigue.",
});
