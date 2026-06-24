export function validatePredictionRequest(body) {
  const errors = [];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!body?.athlete?.email || !EMAIL_RE.test(body.athlete.email)) {
    errors.push({ field: "athlete.email", message: "Valid email is required" });
  }
  if (!["male", "female"].includes(body?.athlete?.sex)) {
    errors.push({ field: "athlete.sex", message: "Sex must be male or female" });
  }
  if (!["open", "pro", "doubles", "relay"].includes(body?.athlete?.division)) {
    errors.push({ field: "athlete.division", message: "Invalid division" });
  }

  const b = body?.benchmarks ?? {};

  if (!b.run5kSeconds || b.run5kSeconds <= 0 || b.run5kSeconds >= 3600) {
    errors.push({ field: "benchmarks.run5kSeconds", message: "Valid 5k time required (under 60 min)" });
  }
  if (!b.backSquat3RM || b.backSquat3RM <= 0 || b.backSquat3RM > 400) {
    errors.push({ field: "benchmarks.backSquat3RM", message: "Valid back squat required (1-400 kg)" });
  }
  if (!b.deadlift3RM || b.deadlift3RM <= 0 || b.deadlift3RM > 500) {
    errors.push({ field: "benchmarks.deadlift3RM", message: "Valid deadlift required (1-500 kg)" });
  }

  if (b.run10kSeconds && b.run5kSeconds && b.run10kSeconds <= b.run5kSeconds) {
    errors.push({ field: "benchmarks.run10kSeconds", message: "10k time must be slower than 5k time" });
  }
  if (b.previousHyroxSeconds && (b.previousHyroxSeconds < 3600 || b.previousHyroxSeconds > 18000)) {
    errors.push({ field: "benchmarks.previousHyroxSeconds", message: "Previous HYROX time must be between 1:00:00 and 5:00:00" });
  }
  if (b.wallBallRepsIn2Min && (b.wallBallRepsIn2Min < 1 || b.wallBallRepsIn2Min > 200)) {
    errors.push({ field: "benchmarks.wallBallRepsIn2Min", message: "Wall ball reps must be 1-200" });
  }

  return errors;
}
