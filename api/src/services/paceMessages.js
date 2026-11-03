const DAY_MS = 86_400_000;
const words = ["zero", "one", "two", "three"];

// nextMilestone is { threshold, displayName, club100Threshold? } (or a day number).
export function choosePaceMessage({ count, target, paceDelta, todayLocal, windowEnd, nextMilestone, reachedTarget }) {
  // All variants are reminders for users behind pace, including the December run-in.
  if (paceDelta > -1) return null;
  const daysLeft = Math.max(0, (Date.parse(windowEnd) - Date.parse(todayLocal)) / DAY_MS + 1);
  const message = (kind, body) => ({ kind, title: body, body });
  if (todayLocal.slice(5, 7) === "12" && !reachedTarget && count < target) {
    const remaining = target - count;
    if (remaining <= daysLeft) return message("december", `${remaining} to go for ${target}, with ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left. Plenty of time.`);
    const club100 = nextMilestone?.club100Threshold ?? Math.max(1, Math.round(target / 2));
    const gap = club100 - count;
    return gap > 0 && gap <= daysLeft ? message("december_club", `Club 100 is in reach — ${gap} to go.`) : null;
  }
  const gap = Math.ceil(-paceDelta);
  if (gap >= 3) {
    const sessions = Math.min(gap, 3);
    if (sessions > daysLeft) return null;
    const action = gap <= 3
      ? `${words[sessions][0].toUpperCase()}${words[sessions].slice(1)} extra sessions this week and you're back.`
      : "Three extra sessions this fortnight will help close the gap.";
    return message("behind", `You're ${gap} behind pace. ${action}`);
  }
  const milestone = typeof nextMilestone === "number"
    ? { threshold: nextMilestone, displayName: `Club ${nextMilestone}` } : nextMilestone;
  const remaining = milestone?.threshold - count;
  return remaining > 0 && remaining <= 3 && remaining <= daysLeft
    ? message("milestone", `Day ${count}. ${milestone.displayName} is ${remaining} away.`) : null;
}

export function dailyReminderBody({ dayLabel, count }) {
  const lead = `Your ${dayLabel || "workout"} session is ready.`;
  return Number.isFinite(count) ? `${lead} Today could be day ${count + 1}.` : `${lead} Get it done.`;
}
