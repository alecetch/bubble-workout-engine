/** Convert stored exercise-media keys to keys within the exercise-media bucket. */
export function exerciseMediaObjectKey(key) {
  return String(key ?? "").trim().replace(/^\/+/, "").replace(/^exercise-media\/+/, "");
}
