import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { websiteApp, requestWebsite, withWebsiteBrand, assert200DaysPage } from "./helpers/websiteBrand.js";
import { insertEmailSignupAndNotify } from "../src/routes/websiteEnhancements.js";
import { createAffiliateHandlers } from "../src/routes/affiliateProgram.js";
import { createGuideSignupHandler } from "../src/routes/contentHub.js";

const paths = ["/", "/download", "/signup", "/signup/confirmed", "/privacy", "/terms", "/blog", "/guides", "/changelog",
  "/hyrox", "/strength", "/pricing", "/support", "/press", "/testimonials", "/partners", "/partners/applied", "/ref/TEST123"];
for (const section of ["blog", "guides"]) {
  for (const file of readdirSync(new URL(`../content/${section}/`, import.meta.url)).filter(name => name.endsWith(".md"))) paths.push(`/${section}/${file.slice(0, -3)}`);
}
for (const path of paths) {
  test(`200 Days copy is complete on ${path}`, () => withWebsiteBrand("200days", async () => {
    const { response, body } = await requestWebsite(websiteApp(), path);
    assert.equal(response.status, 200);
    assert200DaysPage(body, path);
  }));
}

test("unset flag preserves Forma headlines and resolves all content tokens", () => withWebsiteBrand(undefined, async () => {
  const app = websiteApp();
  for (const path of paths) {
    const { response, body } = await requestWebsite(app, path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(body, /\{\{brand\}\}/, path);
    if (path === "/") assert.match(body, /Train with your data/);
    if (path === "/download") assert.match(body, /Forma is coming soon/);
    if (["/blog/hyrox-training-block", "/testimonials"].includes(path)) assert.match(body, /Forma/);
  }
}));

test("home uses the approved year promise, sections and launch-first CTA", () => withWebsiteBrand("200days", async () => {
  const { body } = await requestWebsite(websiteApp(), "/");
  for (const copy of ["200 days changes everything.", "Train 200 days this year: about four a week, with room for life. We plan every session and adapt it to how you're actually performing.",
    "Miss a week? Make it up.", "Resets every 1 January.", "Fit people train about 200 days a year", "Tell us your goals and kit", "Train the plan we build", "Watch the count climb",
    "Hit 200 and you're in for the year. Keep going for Club 250 and Club 300.", "I train 200 days every year. It keeps me honest when I slack, because a missed week is a gap I can make up, not a streak I've broken.",
    "Athletes already training with us.", "What we do for you", "Start your 200."]) assert.ok(body.includes(copy), copy);
  const hero = body.match(/<section class="hero">([\s\S]*?)<\/section>/)[1];
  assert.ok(hero.indexOf('href="/signup"') < hero.indexOf('href="/hyrox-calculator"'));
}));

test("legal pages use the operator line and call-time effective date", () => withWebsiteBrand("200days", async () => {
  for (const path of ["/privacy", "/terms"]) {
    for (const date of ["13 November 2026", "1 January 2027"]) {
      process.env.LEGAL_UPDATED_DATE = date;
      const { body } = await requestWebsite(websiteApp(), path);
      for (const text of ["trading as 200 Days", "06771687", "support@200days.app", "Grain Store, Sheepstreet Lane, Etchingham, East Sussex TN19 7AY.", `Effective date: ${date}`, "200days.app/support"]) assert.ok(body.includes(text), text);
      assert200DaysPage(body, path);
    }
  }
}, { LEGAL_UPDATED_DATE: undefined }));

test("press offers every new asset and keeps the light mark on a light background", () => withWebsiteBrand("200days", async () => {
  const app = websiteApp();
  const { body } = await requestWebsite(app, "/press");
  for (const file of ["200days-lockup.svg", "200days-lockup@2x.png", "200days-mark.svg", "200days-mark-light.svg", "200days-icon-1024.png"]) {
    const path = `/images/brand/${file}`;
    assert.ok(body.includes(`href="${path}"`), path);
    assert.equal((await requestWebsite(app, path)).response.status, 200);
  }
  assert.match(body, /asset-preview" style="background:#F1F5F9;"><img src="\/images\/brand\/200days-mark-light.svg"/);
  assert.ok(body.includes("200 Days is a training app built around one standard: 200 training days a year. It's made by Engle Consulting Limited in East Sussex, UK."));
  assert.doesNotMatch(body, /formai_/);
}));

for (const variant of ["forma", "200days"]) {
  test(`${variant} site emails resolve brand, signature and download without changing sender settings`, () => withWebsiteBrand(variant, async () => {
    const emails = [];
    const emailSender = async email => { emails.push(email); };
    const db = { query: async () => ({ rows: [] }) };
    const res = { redirect(...args) { this.redirected = args; return this; } };
    await insertEmailSignupAndNotify("reader@example.test", "website", db, emailSender);
    await createAffiliateHandlers(db, emailSender).postHandler({ body: { name: "Reader", email: "reader@example.test", platform: "coach" } }, res);
    await createGuideSignupHandler(db, emailSender)({ params: { slug: "hyrox-race-prep-plan" }, body: { email: "reader@example.test" } }, res);
    assert.equal(emails.length, 4);
    if (variant === "200days") {
      for (const email of emails) {
        assert.match(email.text, /200 Days/);
        assert.match(email.html, /200 Days/);
        assert.doesNotMatch(JSON.stringify(email), /\bforma\b|formai|getforma|\{\{brand\}\}/i);
      }
      assert.equal(emails[0].subject, "You're on the 200 Days list");
      assert.ok(emails[0].text.startsWith("Thanks for signing up. We'll send training tips and app news, no spam, and email you the day 200 Days is ready."));
      assert.ok(emails[3].text.endsWith("The 200 Days team"));
      assert.ok(emails[3].text.includes("https://200days.app/downloads/200days-hyrox-race-prep-template.pdf"));
    } else {
      assert.equal(emails[0].subject, "You're on the Forma list");
      assert.equal(emails[0].text, "Hi,\n\nYou're signed up for Forma updates. We'll send training tips and app news - no spam.\n\nWe'll email you when Forma is ready.\n\nTo unsubscribe, reply with 'unsubscribe'.\n\nForma");
      assert.equal(emails[1].subject, "New affiliate application - Reader");
      assert.equal(emails[2].subject, "Thanks for applying to partner with Forma");
      assert.ok(emails[3].text.endsWith("Happy training,\nForma"));
      assert.ok(emails[3].text.includes("https://getforma.fit/downloads/hyrox-race-prep-template.pdf"));
    }
    assert.deepEqual(res.redirected, [302, variant === "200days" ? "/downloads/200days-hyrox-race-prep-template.pdf" : "/downloads/hyrox-race-prep-template.pdf"]);
    for (const email of emails) assert.equal(email.from, undefined);
  }, { AFFILIATE_NOTIFY_EMAIL: "owner@example.test" }));
}

test("past changelog source is preserved and new entry date follows the legal date", () => withWebsiteBrand("200days", async () => {
  const history = readFileSync(new URL("../content/changelog.md", import.meta.url), "utf8");
  const { body } = await requestWebsite(websiteApp(), "/changelog");
  assert.ok(body.includes("Forma is now 200 Days"));
  assert.ok(body.includes("13 November 2026"));
  assert.ok(history.includes("## v1.2"));
  assert.equal(history.includes("Forma is now 200 Days"), false);
}, { LEGAL_UPDATED_DATE: "13 November 2026" }));
