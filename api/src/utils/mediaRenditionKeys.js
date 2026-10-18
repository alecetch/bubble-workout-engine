export const stillThumbKey = key => key ? String(key).replace(/\/still\.jpg$/, "/still-thumb.webp") : null;
export const stillCardKey = key => key ? String(key).replace(/\/still\.jpg$/, "/still-card.webp") : null;
export const posterCardKey = key => key ? String(key).replace(/\/poster\.jpg$/, "/poster-card.webp") : null;
export function heroCardKey(key) {
  return /^hero-media\/(program|program_day)\/[a-z0-9_-]+\.(png|jpg|webp)$/.test(key ?? "")
    ? key.replace(/\.(png|jpg|webp)$/, "-card.webp") : null;
}
