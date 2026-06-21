function handlesFromInsights(selectedInsights = [], athleteRegistry = []) {
  const names = new Set(selectedInsights.flatMap((insight) => insight.athletesInvolved ?? []));
  return athleteRegistry
    .filter((athlete) => names.has(athlete.full_name) && athlete.instagram_handle)
    .map((athlete) => athlete.instagram_handle);
}

export function generateCaption(generatedContent, raceEvent, athleteRegistry = []) {
  const { headline, selectedInsights, suggestedHandles = [] } = generatedContent;
  const evidenceLines = selectedInsights?.[0]?.evidence?.slice(0, 2) ?? [];
  const registryHandles = handlesFromInsights(selectedInsights, athleteRegistry);
  const handles = [...new Set([...suggestedHandles, ...registryHandles])];

  const divisionTag = raceEvent?.division ? `#hyrox${raceEvent.division}` : "";
  const seasonTag = raceEvent?.season ? `#hyrox${raceEvent.season}` : "";
  const hashtags = [
    "#hyrox",
    "#forma",
    "#hyroxperformance",
    "#hybridathlete",
    "#hyroxtraining",
    divisionTag,
    seasonTag,
  ].filter(Boolean);

  const caption = [
    `${headline}.`,
    "",
    ...evidenceLines.map((e) => `- ${e}`),
    "",
    "-> forma.fit",
    "",
    handles.join(" "),
    "",
    hashtags.join(" "),
  ].filter((line) => line !== undefined).join("\n");

  return { caption, handles, hashtags };
}
