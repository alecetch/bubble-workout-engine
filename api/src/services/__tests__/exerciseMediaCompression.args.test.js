import test from "node:test";
import assert from "node:assert/strict";
import { buildEncodeArgs, TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT, CRF, MAXRATE_KBPS, BUFSIZE_KBPS } from "../exerciseMediaCompression.js";

test("encoding settings use bounded 540p CRF with compatible pixels and faststart", () => {
  assert.deepEqual([TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT, CRF, MAXRATE_KBPS, BUFSIZE_KBPS], [960, 540, 28, 1200, 2400]);
  const args = buildEncodeArgs("in.mov", "out.mp4");
  for (const [flag, value] of [["-crf", "28"], ["-maxrate", "1200k"], ["-bufsize", "2400k"], ["-pix_fmt", "yuv420p"], ["-profile:v", "high"], ["-movflags", "+faststart"]]) {
    assert.equal(args[args.indexOf(flag) + 1], value);
  }
  assert.match(args[args.indexOf("-vf") + 1], /min\(960,iw\).*min\(540,ih\).*force_divisible_by=2/);
  assert.ok(args.includes("-an"));
  assert.ok(!args.includes("-b:v"));
});
