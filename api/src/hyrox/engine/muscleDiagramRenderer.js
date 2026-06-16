import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/muscle-diagrams");

const SVG_CACHE = new Map();
function loadSvg(filename) {
  if (!SVG_CACHE.has(filename)) {
    SVG_CACHE.set(filename, readFileSync(join(ASSETS_DIR, filename), "utf-8"));
  }
  return SVG_CACHE.get(filename);
}

const SIGNAL_COLOUR = Object.freeze({
  limiter: "#ef4444",
  asset: "#22c55e",
});

// Applied to every known muscle group that carries no signal, overriding the SVG's decorative gradients.
// Without this, the original blue/purple/dark-blue fills look like meaningful signals.
const NEUTRAL_FILL = "#94a3b8";

const MUSCLE_DIAGRAM_MAP = Object.freeze({
  man_front: {
    posterior_chain: ["gastrocnemius"],
    quad_dominant: ["quadriceps", "sartorius_abductors", "tensor_fasciae_latae"],
    upper_back_pull: ["trapezius", "biceps"],
    push_shoulder: ["pectoralis_major", "deltoid", "triceps"],
    core_stability: ["abdominals", "external_oblique"],
    grip_forearm: ["brachioradialis", "finger_flexors"],
  },
  man_back: {
    posterior_chain: ["gluteus_maximus", "gluteus_medius2", "hamstrings", "abductors", "gastrocnemius", "soleus"],
    quad_dominant: ["tensor_fasciae_latae"],
    upper_back_pull: ["latissimus_dorsi", "infraspinatus_teres_major", "trapezius_lower"],
    push_shoulder: ["deltoid", "triceps"],
    core_stability: ["external_oblique"],
    grip_forearm: ["brachioradialis", "finger_extensors", "finger_flexors"],
  },
  woman_front: {
    posterior_chain: ["gastrocnemius"],
    quad_dominant: ["quadriceps", "iliopsoas_hip_flexors", "tensor_fasciae_latae"],
    upper_back_pull: ["trapezius", "biceps"],
    push_shoulder: ["pectoralis_major", "deltoid", "triceps", "subclavius"],
    core_stability: ["abdominals", "external_oblique"],
    grip_forearm: ["brachioradialis"],
  },
  woman_back: {
    posterior_chain: ["gluteus_maximus", "gluteus_medius", "hamstrings2", "abductors", "gastrocnemius", "soleus"],
    quad_dominant: ["tensor_fasciae_latae"],
    upper_back_pull: ["latissimus_dorsi", "infraspinatus_teres_major", "trapezius"],
    push_shoulder: ["deltoid", "triceps"],
    core_stability: ["external_oblique"],
    grip_forearm: ["brachioradialis", "finger_extensors", "finger_flexors"],
  },
});

function buildStyleBlock(muscleGroupSignals = [], diagramKey) {
  const idMap = MUSCLE_DIAGRAM_MAP[diagramKey] ?? {};
  const signalMap = new Map(muscleGroupSignals.map((signal) => [signal.groupId, signal.signal]));
  const rules = [];
  for (const [groupId, svgIds] of Object.entries(idMap)) {
    const colour = SIGNAL_COLOUR[signalMap.get(groupId)] ?? NEUTRAL_FILL;
    for (const id of svgIds) {
      rules.push(`#${id} path { fill: ${colour}; }`);
    }
  }
  return rules.length > 0 ? `<style>${rules.join(" ")}</style>` : "";
}

function stripInteractive(svgString) {
  return svgString
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<div[^>]+id="tooltip"[\s\S]*?<\/div>/gi, "")
    .replace(/\sdata-tooltip-text="[^"]*"/g, "")
    .replace(/\sclass="tooltip-trigger"/g, "")
    .replace(/\sclass="muscle"/g, "")
    .replace(/<path[^>]+id="muscle-0-interactive"[^>]*\/>/g, "");
}

function prepareSvg(rawSvg, styleBlock) {
  const stripped = stripInteractive(rawSvg);
  if (!styleBlock) return stripped;
  return stripped.replace(/(<svg[^>]*>)/, `$1${styleBlock}`);
}

export function renderMuscleDiagramPair(muscleGroupProfile, sex = "male") {
  if (!muscleGroupProfile?.available) return null;
  const prefix = sex === "female" ? "woman" : "man";

  // Only colour primary limiters (red) and primary assets (green).
  // Mixed and secondary signals produce noise — the diagram should guide focus, not categorise everything.
  const focused = new Set([
    ...(muscleGroupProfile.primaryLimiters ?? []),
    ...(muscleGroupProfile.primaryAssets ?? []),
  ]);
  const signals = (muscleGroupProfile.muscleGroupSignals ?? []).filter(
    (s) => focused.has(s.groupId),
  );

  return {
    frontSvg: prepareSvg(
      loadSvg(`${prefix}-front.svg`),
      buildStyleBlock(signals, `${prefix}_front`),
    ),
    backSvg: prepareSvg(
      loadSvg(`${prefix}-back.svg`),
      buildStyleBlock(signals, `${prefix}_back`),
    ),
  };
}
