function sentencesFrom(content) {
  const text = Array.isArray(content) ? content.join(" ") : String(content ?? "");
  return text
    .match(/[^.]+\./g)
    ?.map((sentence) => sentence.trim().replace(/\s+/g, " "))
    .filter(Boolean) ?? [];
}

export function assertNoOrdinalErrors(text) {
  const source = String(text ?? "");
  const ordinalPattern = /\b(\d+)(st|nd|rd|th)\b/gi;
  let match;
  while ((match = ordinalPattern.exec(source)) !== null) {
    const value = Number(match[1]);
    const suffix = match[2].toLowerCase();
    const teens = value % 100;
    const remainder = value % 10;
    const expected = teens >= 11 && teens <= 13
      ? "th"
      : remainder === 1
        ? "st"
        : remainder === 2
          ? "nd"
          : remainder === 3
            ? "rd"
            : "th";
    if (suffix !== expected) {
      throw new Error(`Invalid ordinal found: ${match[0]}`);
    }
  }
}

export function assertNoZeroOpportunityHero(heroHtml) {
  if (/>0:00</.test(String(heroHtml ?? ""))) {
    throw new Error("Hero renders a 0:00 opportunity");
  }
}

export function assertNoDuplicateSentences(sections) {
  const seen = new Map();
  for (const section of sections ?? []) {
    for (const sentence of sentencesFrom(section.content)) {
      const previous = seen.get(sentence);
      if (previous && previous !== section.sectionKey) {
        throw new Error(`Duplicate sentence in ${previous} and ${section.sectionKey}: ${sentence}`);
      }
      seen.set(sentence, section.sectionKey);
    }
  }
}

export function assertNoRawClockTimestamps(text) {
  const source = String(text ?? "");
  const pattern = /\b\d{1,2}:\d{2}:\d{2}\b/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const prefix = source.slice(Math.max(0, match.index - 11), match.index).toLowerCase();
    if (!prefix.endsWith("clock time ")) {
      throw new Error(`Raw clock timestamp found: ${match[0]}`);
    }
  }
}

export function assertBackgroundAgreesWithContract(claimedCategory, contract) {
  const actualCategory = contract?.gapReconciliation?.largestCategory?.key ?? null;
  if (!claimedCategory || !actualCategory) return; // nothing to compare — not an error
  const isRunOrStation = (key) => key === "run_time" || key === "work_time";
  if (isRunOrStation(claimedCategory) && isRunOrStation(actualCategory) && claimedCategory !== actualCategory) {
    throw new Error(
      `Background section claims "${claimedCategory}" is the limiting category, but the contract's largest category is "${actualCategory}"`,
    );
  }
}
