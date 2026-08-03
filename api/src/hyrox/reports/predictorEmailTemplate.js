function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function firstName(athlete = {}) {
  return String(athlete.name ?? "").trim().split(/\s+/)[0] || "there";
}

function segmentLabel(segment) {
  return segment?.label ?? segment?.segmentName ?? segment?.segmentKey ?? null;
}

function textLine(label, value) {
  return value ? `${label}: ${value}` : null;
}

export function buildPredictorEmailContent(predictionResult = {}, athlete = {}) {
  const limiter = segmentLabel(predictionResult.topLimiters?.[0]);
  const opportunity = segmentLabel(predictionResult.topOpportunities?.[0]);
  const range = predictionResult.rangeLowFormatted && predictionResult.rangeHighFormatted
    ? `${predictionResult.rangeLowFormatted} - ${predictionResult.rangeHighFormatted}`
    : null;
  const target = predictionResult.targetComparison?.gapFormatted
    ? `${predictionResult.targetComparison.gapFormatted} ${predictionResult.targetComparison.gapSeconds >= 0 ? "under" : "over"} your target`
    : null;
  const subject = `Your HYROX prediction${predictionResult.predictedFinishFormatted ? `: ${predictionResult.predictedFinishFormatted}` : ""}`;
  const reengagement = "After your first HYROX, come back to the Hit a target time / analyse tool to compare this prediction with your real result.";
  const rows = [
    textLine("Predicted finish", predictionResult.predictedFinishFormatted),
    textLine("Likely range", range),
    textLine("Top limiter", limiter),
    textLine("Top opportunity", opportunity),
    textLine("Target check", target),
  ].filter(Boolean);
  const text = [`Hi ${firstName(athlete)},`, "", "Here is your Predict My First HYROX result.", "", ...rows, "", reengagement, "", "Forma"].join("\n");
  const listItems = rows.map((row) => {
    const [label, ...rest] = row.split(": ");
    return `<li><strong>${esc(label)}:</strong> ${esc(rest.join(": "))}</li>`;
  }).join("");
  const html = `
    <div style="font-family:Inter,Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:28px;color:#0f172a;">
      <p style="margin:0 0 16px;">Hi ${esc(firstName(athlete))},</p>
      <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.1;margin:0 0 18px;">Your HYROX prediction</h1>
      ${predictionResult.predictedFinishFormatted ? `<div style="background:#0f172a;color:#fff;padding:18px;margin:0 0 18px;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#67e8f9;">Predicted finish</div><div style="font-size:34px;font-weight:700;">${esc(predictionResult.predictedFinishFormatted)}</div></div>` : ""}
      ${listItems ? `<ul style="padding-left:20px;margin:0 0 18px;line-height:1.6;">${listItems}</ul>` : ""}
      <p style="margin:0 0 12px;line-height:1.5;">${esc(reengagement)}</p>
      <p style="margin:20px 0 0;color:#475569;font-size:13px;">Forma</p>
    </div>
  `.trim();
  return { subject, html, text };
}
