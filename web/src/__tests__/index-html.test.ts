import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
test("calculator head contains current branding, icons and absolute preview URLs", () => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.title).toBe("HYROX Performance Calculator | 200 Days");
  // "Performance" in the required title contains the substring "forma".
  expect(html).not.toMatch(/\bforma\b|formai|getforma/i);
  const icons = [...doc.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')];
  expect(icons).toHaveLength(3);
  for (const icon of icons) expect(icon.getAttribute("href")).toMatch(/^\/images\/brand\//);
  expect(doc.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://200days.app/images/brand/og-200days.png");
  expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://200days.app/hyrox-calculator");
  expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Free HYROX performance calculator from 200 Days. Benchmark your race, find your biggest time gaps and see what to train next.");
  expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#0F172A");
  expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe("summary_large_image");
});
