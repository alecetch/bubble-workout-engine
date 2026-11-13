import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

// Text extraction only: the runtime generator uses Puppeteer, never pdf-parse.
test("committed 200 Days guide is a non-empty, branded one-page PDF", async () => {
  const data = await readFile(new URL("../public/downloads/200days-hyrox-race-prep-template.pdf", import.meta.url));
  assert.ok(data.length > 1000);
  assert.equal(data.subarray(0, 5).toString(), "%PDF-");
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    assert.equal(result.total, 1);
    assert.match(result.text, /Hyrox 12-Week Template - Download 200 Days for your personalised plan/);
    assert.doesNotMatch(result.text, /Formai|Forma|\{\{brand\}\}/);
  } finally { await parser.destroy(); }
  assert.ok((await readFile(new URL("../public/downloads/hyrox-race-prep-template.pdf", import.meta.url))).length > 0);
});
