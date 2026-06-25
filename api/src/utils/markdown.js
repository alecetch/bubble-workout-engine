/**
 * Parses YAML-style frontmatter from a Markdown file string.
 * Supports simple key: value pairs only; no nested objects or arrays.
 */
export function parseFrontmatter(src) {
  const normalized = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: normalized };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    meta[key] = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2] };
}
