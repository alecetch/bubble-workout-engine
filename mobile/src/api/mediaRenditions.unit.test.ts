import { describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({ authGetJson: vi.fn(), authPatchJson: vi.fn() }));
import { normalizeProgramDayFull, normalizeProgramOverview } from "./programViewer";
import { normalizeGuidance } from "./exerciseGuidance";
import { normalizePrograms, normalizeTimeline } from "./historyNormalizers";

describe("rendition normalization", () => {
  it.each(["snake", "camel"])("normalizes %s exercise heroes without changing curated fields", style => {
    const hero = style === "snake" ? { hero_exercise_media: { exercise_id: "squat", exercise_name: "Back Squat", url: "exercise-card", thumbhash: "exercise-hash" } }
      : { heroExerciseMedia: { exerciseId: "squat", exerciseName: "Back Squat", url: "exercise-card", thumbhash: "exercise-hash" } };
    const day = normalizeProgramDayFull({ day: { ...hero, hero_media: "curated", hero_media_card: "curated-card" } }).day;
    expect(day.heroExerciseMedia).toEqual({ exerciseId: "squat", exerciseName: "Back Squat", url: "exercise-card", thumbhash: "exercise-hash" });
    expect(day.heroMedia).toBe("curated");
    expect(day.heroMediaCard).toBe("curated-card");
  });

  it("defaults missing or unusable exercise heroes to null and missing hashes to null", () => {
    for (const hero of [undefined, null, {}, { url: null }, { url: "" }]) {
      expect(normalizeProgramDayFull({ day: { hero_exercise_media: hero } }).day.heroExerciseMedia).toBeNull();
    }
    expect(normalizeProgramDayFull({ day: { heroExerciseMedia: { url: "card" } } }).day.heroExerciseMedia?.thumbhash).toBeNull();
  });
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
