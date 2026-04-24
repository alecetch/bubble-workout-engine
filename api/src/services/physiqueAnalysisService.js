import OpenAI from "openai";

const OPENAI_MODEL = "gpt-4o";

let _client = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export async function analysePhysiquePhoto(currentPhotoBase64, priorPhoto = null) {
  const content = [];

  content.push({
    type: "text",
    text: buildPrompt(priorPhoto !== null),
  });

  content.push({
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${currentPhotoBase64}`,
      detail: "low",
    },
  });

  if (priorPhoto) {
    content.push({
      type: "text",
      text: `For comparison, here is a photo from ${priorPhoto.submittedAt}:`,
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${priorPhoto.base64}`,
        detail: "low",
      },
    });
  }

  const response = await getClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    max_tokens: 600,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return normaliseAnalysis(parsed);
}

function buildPrompt(hasComparison) {
  return [
    "You are a fitness coach providing a physique assessment based on a photo.",
    "Your tone is professional, encouraging, and non-clinical. Do not use medical language.",
    "Return a JSON object with exactly these keys:",
    "  observations: array of 2-4 strings. Each is a factual, specific observation about visible muscle development.",
    "    Examples: 'Visible quad sweep development with defined VMO', 'Rear deltoid and upper trapezius are well-developed'.",
    "  comparison_notes: " + (hasComparison
      ? "a single string comparing to the prior photo (e.g. 'shoulder-to-waist ratio appears improved since last check-in'). Be specific. Do not invent changes if the images look similar."
      : "null (no prior photo available for comparison)."),
    "  emphasis_suggestions: array of 1-3 strings. These are body part slug suggestions for programming emphasis.",
    "    Choose ONLY from this list: upper_back, lower_back, chest, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core.",
    "  disclaimer: the fixed string 'This is AI-generated guidance based on visual observation. It is not medical advice.'",
    "Return only the JSON object. No markdown, no explanation outside the JSON.",
  ].join("\n");
}

const VALID_EMPHASIS_SLUGS = new Set([
  "upper_back", "lower_back", "chest", "shoulders",
  "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core",
]);

export function normaliseAnalysis(parsed) {
  const observations = Array.isArray(parsed.observations)
    ? parsed.observations.filter((s) => typeof s === "string").slice(0, 4)
    : [];

  const comparisonNotes = typeof parsed.comparison_notes === "string"
    ? parsed.comparison_notes
    : null;

  const emphasisSuggestions = Array.isArray(parsed.emphasis_suggestions)
    ? parsed.emphasis_suggestions
      .filter((s) => typeof s === "string" && VALID_EMPHASIS_SLUGS.has(s))
      .slice(0, 3)
    : [];

  return {
    observations,
    comparison_notes: comparisonNotes,
    emphasis_suggestions: emphasisSuggestions,
    disclaimer: "This is AI-generated guidance based on visual observation. It is not medical advice.",
  };
}
