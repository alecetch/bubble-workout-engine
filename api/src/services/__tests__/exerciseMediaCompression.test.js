import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { compressExerciseVideo, probeVideo, remuxFaststart } from "../exerciseMediaCompression.js";

const execFileAsync = promisify(execFile);

for (const [label, source, seconds, pixelFormat] of [
  ["converts 4:2:2 to 4:2:0", "testsrc=size=640x360:rate=24", "1", "yuv422p"],
  ["caps a busy 8 second clip below 1.4 MB", "testsrc2=size=1920x1080:rate=30", "8", "yuv420p"],
]) {
  test(label, { skip: !(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe")) }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "video-fixture-"));
    try {
      const path = join(dir, "input.mp4");
      await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", source, "-t", seconds,
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", pixelFormat, path]);
      const input = await import("node:fs/promises").then(fs => fs.readFile(path));
      const result = await compressExerciseVideo(input);
      const probe = await probeVideo(result.compressedBuffer);
      assert.equal(probe.pixFmt, "yuv420p");
      assert.equal(probe.codec, "h264");
      assert.ok(probe.width <= 960 && probe.height <= 540);
      assert.ok(result.compressedBuffer.length < 1_400_000);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test("remuxFaststart preserves dimensions and moves moov ahead of mdat", { skip: !(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe")) }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "video-fixture-"));
  try {
    const path = join(dir, "input.mp4");
    await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-t", "1", "-c:v", "libx264", path]);
    const input = await import("node:fs/promises").then(fs => fs.readFile(path));
    const before = await probeVideo(path);
    const result = await remuxFaststart(input);
    const after = await probeVideo(result.compressedBuffer);
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    assert.equal(after.pixFmt, before.pixFmt);
    assert.equal(after.hasAudio, false);
    assert.ok(result.compressedBuffer.indexOf("moov") > 0);
    assert.ok(result.compressedBuffer.indexOf("moov") < result.compressedBuffer.indexOf("mdat"));
    assert.ok(result.posterBuffer.length > 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

async function hasBinary(name) {
  try {
    await execFileAsync(name, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

test("compressExerciseVideo outputs muted H.264 video capped at 540p", { skip: !(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe")) }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "exercise-media-fixture-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "out.mp4");
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=1920x1080:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=44100",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      inputPath,
    ]);
    const input = await import("node:fs/promises").then((fs) => fs.readFile(inputPath));
    const result = await compressExerciseVideo(input);
    await writeFile(outputPath, result.compressedBuffer);

    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,pix_fmt",
      "-of",
      "json",
      outputPath,
    ]);
    const streams = JSON.parse(stdout).streams;
    const video = streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.codec_name, "h264");
    assert.equal(video.pix_fmt, "yuv420p");
    assert.ok(result.compressedBuffer.indexOf("moov") < result.compressedBuffer.indexOf("mdat"));
    assert.ok(video.width <= 960);
    assert.ok(video.height <= 540);
    assert.equal(streams.some((stream) => stream.codec_type === "audio"), false);

    const duration = Number.parseFloat((await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      outputPath,
    ])).stdout.trim());
    assert.ok(Math.abs(result.durationSec - duration) < 0.15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compressExerciseVideo keeps dimensions even for ultra-wide input", { skip: !(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe")) }, async () => {
  // 2520x1080 (7:3) scales to 960x411.43; without rounding to an even height
  // libx264 rejects it ("height not divisible by 2").
  const dir = await mkdtemp(join(tmpdir(), "exercise-media-fixture-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "out.mp4");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=size=2520x1080:rate=24", "-t", "1", "-c:v", "libx264", inputPath,
    ]);
    const input = await import("node:fs/promises").then((fs) => fs.readFile(inputPath));
    const result = await compressExerciseVideo(input);
    await writeFile(outputPath, result.compressedBuffer);

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", outputPath,
    ]);
    const [video] = JSON.parse(stdout).streams;
    assert.equal(video.width, 960);
    assert.ok(video.height <= 540);
    assert.equal(video.width % 2, 0);
    assert.equal(video.height % 2, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compressExerciseVideo rejects corrupt input and leaves no temp exercise-media dirs", { skip: !(await hasBinary("ffmpeg")) }, async () => {
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("exercise-media-")));
  await assert.rejects(() => compressExerciseVideo(Buffer.from("not a video")));
  const after = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("exercise-media-")));
  assert.deepEqual(after, before);
});
