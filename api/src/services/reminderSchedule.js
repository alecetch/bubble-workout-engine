import { firstValidTimezone } from "../utils/timezone.js";

export function reminderDue(row, instant) {
  const requested = row.reminder_time_local_hhmm;
  const valid = typeof requested === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requested);
  const due = valid ? (requested > "23:30" ? "23:30" : requested) : "08:00";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: firstValidTimezone(row.timezone, row.reminder_timezone),
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const time = `${parts.find(part => part.type === "hour").value}:${parts.find(part => part.type === "minute").value}`;
  return time >= due;
}
