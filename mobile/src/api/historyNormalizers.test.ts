import { describe, expect, it } from "vitest";
import { normalizePrograms, normalizeTimeline } from "./historyNormalizers";

describe("history hero URLs", () => {
  it("preserves program hero URL and ID independently", () => {
    expect(normalizePrograms([{ heroMediaId: "media-id", heroMediaUrl: "https://cdn.test/program.png" }])[0])
      .toMatchObject({ heroMediaId: "media-id", heroMediaUrl: "https://cdn.test/program.png" });
  });

  it.each(["heroMediaUrl", "hero_media_url"])("maps timeline %s", (key) => {
    expect(normalizeTimeline({ items: [{ hero_media_id: "media-id", [key]: "https://cdn.test/day.png" }] }).items[0])
      .toMatchObject({ heroMediaId: "media-id", heroMediaUrl: "https://cdn.test/day.png" });
  });

  it.each([undefined, null])("defaults absent or null URLs to null without using the ID (%s)", (url) => {
    expect(normalizePrograms([{ heroMediaId: "media-id", heroMediaUrl: url }])[0].heroMediaUrl).toBeNull();
    expect(normalizeTimeline({ items: [{ heroMediaId: "media-id", heroMediaUrl: url }] }).items[0].heroMediaUrl).toBeNull();
  });
});
