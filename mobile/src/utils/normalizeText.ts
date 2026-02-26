export function normalizeText(input: string): string {
  return String(input ?? "")
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}
