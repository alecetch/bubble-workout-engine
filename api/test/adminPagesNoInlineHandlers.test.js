import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The admin CSP sets script-src-attr 'none', so the browser silently ignores inline
// event-handler attributes (onclick="...", onchange="..."). Buttons rendered that way look
// fine but do nothing. Attach handlers from script (addEventListener / el.onclick = fn).
const adminDir = fileURLToPath(new URL("../admin/", import.meta.url));
const INLINE_HANDLER = /\son[a-z]+\s*=\s*["'`]/gi;

test("admin pages use no inline event-handler attributes (blocked by script-src-attr 'none')", () => {
  const offenders = [];
  for (const file of readdirSync(adminDir).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(adminDir + file, "utf8");
    for (const match of html.matchAll(INLINE_HANDLER)) {
      const line = html.slice(0, match.index).split("\n").length;
      offenders.push(`${file}:${line} ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});
