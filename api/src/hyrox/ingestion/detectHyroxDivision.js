/**
 * Detects HYROX race format (singles/doubles) and sex division from a HYROX results URL.
 *
 * Event code encoding:
 *   HD_ prefix → doubles race
 *   H_ prefix (non-HD) → singles race
 * Sex encoding via search[sex]:
 *   M → male, W/F → female, X → mixed
 *
 * Returns normalised fields that can be passed through the import pipeline without
 * re-parsing the HTML — the HTML alone does not reliably encode doubles vs singles.
 */
export function detectHyroxDivisionFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      raceFormat: "unknown",
      divisionSex: "unknown",
      divisionLabel: "Unknown",
      eventCode: null,
      eventPrefix: null,
      sexParam: null,
      source: "invalid_url",
    };
  }

  const event = parsed.searchParams.get("event") ?? "";
  const searchEvent = parsed.searchParams.get("search_event") ?? "";
  const sex = parsed.searchParams.get("search[sex]") ?? "";

  const eventCode = event || searchEvent || null;
  const eventPrefix = eventCode ? (eventCode.split("_")[0] ?? "") : null;

  // Check HD before H — "HD" starts with "H" so order matters
  let raceFormat;
  if (!eventPrefix) {
    raceFormat = "unknown";
  } else if (eventPrefix.startsWith("HD")) {
    raceFormat = "doubles";
  } else if (eventPrefix.startsWith("H")) {
    raceFormat = "singles";
  } else {
    raceFormat = "unknown";
  }

  let divisionSex;
  if (sex === "M") {
    divisionSex = "male";
  } else if (sex === "W" || sex === "F") {
    divisionSex = "female";
  } else if (sex === "X") {
    divisionSex = "mixed";
  } else {
    divisionSex = "unknown";
  }

  let divisionLabel;
  if (raceFormat === "singles") {
    if (divisionSex === "male") divisionLabel = "Singles Men";
    else if (divisionSex === "female") divisionLabel = "Singles Women";
    else divisionLabel = "Singles";
  } else if (raceFormat === "doubles") {
    if (divisionSex === "male") divisionLabel = "Men's Doubles";
    else if (divisionSex === "female") divisionLabel = "Women's Doubles";
    else if (divisionSex === "mixed") divisionLabel = "Mixed Doubles";
    else divisionLabel = "Doubles";
  } else {
    divisionLabel = "Unknown";
  }

  return {
    raceFormat,
    divisionSex,
    divisionLabel,
    eventCode,
    eventPrefix,
    sexParam: sex || null,
    source: eventCode ? "url_event_param" : "no_event_param",
  };
}
