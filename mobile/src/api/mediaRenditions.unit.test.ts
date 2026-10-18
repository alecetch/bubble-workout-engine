import { describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({ authGetJson: vi.fn(), authPatchJson: vi.fn() }));
import { normalizeProgramDayFull, normalizeProgramOverview } from "./programViewer";
import { normalizeGuidance } from "./exerciseGuidance";
import { normalizePrograms, normalizeTimeline } from "./historyNormalizers";

describe("rendition normalization", () => {
  it.each(["camel", "snake"])("maps %s exercise and hero fields", style => {
    const exercise = style === "camel"
      ? { stillThumbUrl: "thumb", stillCardUrl: "card", posterCardUrl: "poster", stillThumbhash: "hash" }
      : { still_thumb_url: "thumb", still_card_url: "card", poster_card_url: "poster", still_thumbhash: "hash" };
    const hero = style === "camel" ? { heroMediaCard: "hero-card", heroMediaThumbhash: "hero-hash" } : { hero_media_card: "hero-card", hero_media_thumbhash: "hero-hash" };
    const day = normalizeProgramDayFull({ day: hero, segments: [{ items: [exercise] }] });
    expect(day.day).toMatchObject({ heroMediaCard: "hero-card", heroMediaThumbhash: "hero-hash" });
    expect(day.segments[0].exercises[0]).toMatchObject({ stillThumbUrl: "thumb", stillCardUrl: "card", posterCardUrl: "poster", stillThumbhash: "hash" });
    expect(normalizeGuidance(exercise)).toMatchObject({ stillThumbUrl: "thumb", posterCardUrl: "poster", stillThumbhash: "hash" });
    expect(normalizeProgramOverview({ program: hero }).program.heroMediaCard).toBe("hero-card");
    const history = style === "camel" ? { heroMediaCardUrl: "hero-card", heroMediaThumbhash: "hash" } : { hero_media_card_url: "hero-card", hero_media_thumbhash: "hash" };
    expect(normalizePrograms([history])[0]).toMatchObject({ heroMediaCardUrl: "hero-card", heroMediaThumbhash: "hash" });
    expect(normalizeTimeline({ items: [history] }).items[0]).toMatchObject({ heroMediaCardUrl: "hero-card", heroMediaThumbhash: "hash" });
  });

  it("defaults missing rendition fields to null", () => {
    expect(normalizeGuidance({}).stillThumbUrl).toBeNull();
    expect(normalizeProgramOverview({}).program.heroMediaCard).toBeNull();
    expect(normalizeProgramDayFull({ segments: [{ items: [{}] }] }).segments[0].exercises[0].posterCardUrl).toBeNull();
    expect(normalizePrograms([{}])[0].heroMediaCardUrl).toBeNull();
    expect(normalizeTimeline({ items: [{}] }).items[0].heroMediaThumbhash).toBeNull();
  });
});
