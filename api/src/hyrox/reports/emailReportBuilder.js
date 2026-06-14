import { enforceTone } from "./copyFormatter.js";

function limiterName(analysisJson = {}) {
  return analysisJson.headline?.biggestLimiter?.label ?? analysisJson.limiters?.[0]?.label ?? null;
}

function contentText(content) {
  if (Array.isArray(content)) return content.join("\n");
  return String(content ?? "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEmailReport(personalReport, analysisJson = {}, athleteContext = {}) {
  const limiter = limiterName(analysisJson);
  const subject = limiter ? `Your HYROX bottleneck is ${limiter}` : "Your HYROX analysis is ready";
  const greeting = `Hi ${athleteContext.firstName ?? athleteContext.displayName ?? "there"},`;
  const htmlSections = personalReport.sections.map((section) => {
    const body = Array.isArray(section.content)
      ? `<ul>${section.content.map((item) => `<li>${escapeHtml(enforceTone(item))}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(enforceTone(section.content))}</p>`;
    return `<section><h2>${escapeHtml(section.title)}</h2>${body}</section>`;
  }).join("");
  const textSections = personalReport.sections.map((section) => `${section.title}\n${contentText(section.content)}`).join("\n\n");

  return {
    subject: enforceTone(subject),
    htmlBody: enforceTone(`<p>${escapeHtml(greeting)}</p>${htmlSections}`),
    textBody: enforceTone(`${greeting}\n\n${textSections}`),
  };
}
