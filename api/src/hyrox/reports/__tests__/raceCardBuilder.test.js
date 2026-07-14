import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRaceCardHtml } from "../raceCardBuilder.js";

function fixtureData(overrides = {}) {
  return {
    athleteName: "Alex Smith",
    finishTime: "1:35:38",
    targetTime: "1:20:00",
    percentileText: "38th percentile",
    formaScore: 72,
    mode: "target",
    strongestStation: { name: "Sled Pull", percentile: "Top 12%" },
    biggestLimiter: { name: "Wall Balls", rankText: "18th percentile", potentialGain: "2:44" },
    splitRows: [
      { label: "Run 3", delta: "+0:32", tone: "negative" },
      { label: "Sled Push", delta: "+0:51", tone: "negative" },
      { label: "Sled Pull", delta: "-0:18", tone: "positive" },
      { label: "Burpee Broad Jump", delta: "+0:42", tone: "negative" },
      { label: "Row", delta: "-0:11", tone: "positive" },
      { label: "Farmers Carry", delta: "+0:24", tone: "negative" },
      { label: "Sandbag Lunges", delta: "+0:39", tone: "negative" },
      { label: "Wall Balls", delta: "+1:06", tone: "negative" },
      { label: "SkiErg", delta: "-0:09", tone: "positive" },
    ],
    isDoubles: false,
    ...overrides,
  };
}

function allRaceSplits() {
  return [
    "Run 1",
    "SkiErg",
    "Run 2",
    "Sled Push",
    "Run 3",
    "Sled Pull",
    "Run 4",
    "Burpee Broad Jump",
    "Run 5",
    "Row",
    "Run 6",
    "Farmers Carry",
    "Run 7",
    "Sandbag Lunges",
    "Run 8",
    "Wall Balls",
  ].map((label, index) => ({
    label,
    userTime: `${5 + Math.floor(index / 2)}:${String(10 + index).padStart(2, "0")}`,
    delta: index % 3 === 0 ? "-0:18" : `+0:${String(12 + index).padStart(2, "0")}`,
    tone: index % 3 === 0 ? "positive" : "negative",
  }));
}

function sectionBetween(html, start, end) {
  const startIndex = html.indexOf(start);
  assert.ok(startIndex >= 0, `missing start marker ${start}`);
  const endIndex = html.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `missing end marker ${end}`);
  return html.slice(startIndex, endIndex);
}

describe("buildRaceCardHtml asset-backed artwork", () => {
  it("renders the header hero as an image when the asset loads", () => {
    const html = buildRaceCardHtml(fixtureData());

    const header = sectionBetween(html, '<div class="header">', '<div class="hr"></div>');
    assert.match(header, /<img src="data:image\/jpeg;base64,/);
    assert.doesNotMatch(header, /id="rgl"/);
  });

  it("renders the strongest station card with a bundled image icon", () => {
    const html = buildRaceCardHtml(fixtureData({ strongestStation: { name: "Sled Pull", percentile: "Top 12%" } }));
    const card = sectionBetween(html, "Strongest Station", "YOU POWERED THROUGH HERE");

    assert.match(card, /<img src="data:image\/png;base64,/);
  });

  it("renders the biggest limiter card with a bundled image icon", () => {
    const html = buildRaceCardHtml(fixtureData({ biggestLimiter: { name: "Wall Balls", rankText: "18th percentile" } }));
    const card = sectionBetween(html, "Biggest Limiter", "THIS IS WHAT HELD YOU BACK");

    assert.match(card, /<img src="data:image\/png;base64,/);
  });

  it("falls back to the hand-drawn SVG icon when no station icon can resolve", () => {
    const html = buildRaceCardHtml(fixtureData({ strongestStation: { name: "", percentile: "Top 12%" } }));
    const card = sectionBetween(html, "Strongest Station", "YOU POWERED THROUGH HERE");

    assert.match(card, /<svg viewBox="0 0 80 80"/);
    assert.match(card, /<polygon points="40,4 72,22 72,58 40,76 8,58 8,22"/);
  });

  it("renders chart images for simple-icon stations, including Run and SkiErg", () => {
    const html = buildRaceCardHtml(fixtureData({
      splitRows: [
        { label: "Sled Push", delta: "+0:51", tone: "negative" },
        { label: "Run 3", delta: "+0:32", tone: "negative" },
        { label: "SkiErg", delta: "-0:09", tone: "positive" },
      ],
    }));

    assert.match(html, /<image data-station-icon="simple-sled-push\.png" href="data:image\/png;base64,/);
    assert.match(html, /<image data-station-icon="simple-running\.png" href="data:image\/png;base64,/);
    assert.match(html, /<image data-station-icon="simple-skierg\.png" href="data:image\/png;base64,/);
    assert.doesNotMatch(html, /data-station-icon="hex-running\.png"/);
    assert.doesNotMatch(html, /data-station-icon="hex-skierg\.png"/);
  });

  it("renders the full 16-event race split profile with split times", () => {
    const html = buildRaceCardHtml(fixtureData({ splitRows: allRaceSplits() }));
    const splitProfile = sectionBetween(html, "Race Split Profile", '<div class="footer">');

    assert.equal((splitProfile.match(/data-station-icon=/g) ?? []).length, 16);
    assert.match(splitProfile, />5:10</);
    assert.match(splitProfile, />12:25</);
  });

  it("uses the email-style Forma lockup and tagline", () => {
    const html = buildRaceCardHtml(fixtureData());

    assert.match(html, /alt="Forma"/);
    assert.match(html, /PERFORMANCE ENGINEER/);
    assert.match(html, /www\.getforma\.fit/);
    assert.doesNotMatch(html, /Data\. Insight\. Performance\./);
  });

  it("renders doubles athlete names as one athlete per line with surname accent colour", () => {
    const html = buildRaceCardHtml(fixtureData({
      athleteName: "Smith, Alice & Jones, Bob",
      isDoubles: true,
    }));
    const athlete = sectionBetween(html, '<div class="slbl">Athlete</div>', '<div class="sdiv"></div>');

    assert.match(athlete, /<div class="sname"><span class="name-wh">ALICE<\/span> <span class="name-cy">SMITH<\/span><\/div>/);
    assert.match(athlete, /<div class="sname"><span class="name-wh">BOB<\/span> <span class="name-cy">JONES<\/span><\/div>/);
    assert.doesNotMatch(athlete, /<div class="sname"><span class="name-wh">ALICE<\/span><\/div>\s*<div class="sname"><span class="name-cy">SMITH &amp; JONES, BOB<\/span><\/div>/);
  });

  it("does not throw when cards and split rows are absent", () => {
    assert.doesNotThrow(() => buildRaceCardHtml(fixtureData({
      strongestStation: null,
      biggestLimiter: null,
      splitRows: [],
    })));
  });

  it("produces balanced smoke-test markup for a full race card", () => {
    const html = buildRaceCardHtml(fixtureData());

    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /Race Split Profile/);
    assert.equal((html.match(/<div\b/g) ?? []).length, (html.match(/<\/div>/g) ?? []).length);
    assert.equal((html.match(/<svg\b/g) ?? []).length, (html.match(/<\/svg>/g) ?? []).length);
  });
});
