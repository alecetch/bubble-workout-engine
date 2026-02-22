// api/bubbleClient.js
import "dotenv/config";

const base = process.env.BUBBLE_API_BASE?.replace(/\/$/, "");
const token = process.env.BUBBLE_API_TOKEN;

if (!base || !token) {
  console.warn("Missing BUBBLE_API_BASE or BUBBLE_API_TOKEN in environment.");
}

function bubbleUrl(path) {
  return `${base}${path}`;
}

async function bubbleFetch(path) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(bubbleUrl(path), {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bubble API ${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function getThing(type, id) {
  const encodedType = encodeURIComponent(type);
  return bubbleFetch(`/api/1.1/obj/${encodedType}/${id}`);
}

export async function listThings(type, query = "") {
  const encodedType = encodeURIComponent(type);
  const suffix = query ? `?${query}` : "";
  return bubbleFetch(`/api/1.1/obj/${encodedType}${suffix}`);
}

export async function fetchInputs({ clientProfileId }) {
  const [
    clientProfile,
    exercises,
    narration,
    repRules,
    genConfigs,
    catalogBuilds,
    equipment,
    media,
  ] = await Promise.all([
    getThing("Client Profile", clientProfileId),
    listThings("ExerciseCatalogue", "limit=100"),
    listThings("Narration_templates", "limit=100"),
    listThings("Program_rep_rules", "limit=100"),
    listThings("ProgramGenerationConfig", "limit=100"),
    listThings("CatalogBuild", "limit=100"),
    listThings("EquipmentItems", "limit=100"),
    listThings("MediaAsset", "limit=100"),
  ]);

  return {
    clientProfile,
    exercises,
    configs: {
      narration,
      repRules,
      genConfigs,
      catalogBuilds,
      equipment,
      media,
    },
  };
}