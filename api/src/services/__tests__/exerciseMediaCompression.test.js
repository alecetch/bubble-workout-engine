import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { compressExerciseVideo } from "../exerciseMediaCompression.js";

const execFileAsync = promisify(execFile);

async function hasBinary(name) {
  try {
    await execFileAsync(name, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

test("compressExerciseVideo outputs muted H.264 video capped at 720p", { skip: !(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe")) }, async () => {
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
      "stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      outputPath,
    ]);
    const streams = JSON.parse(stdout).streams;
    const video = streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.codec_name, "h264");
    assert.ok(video.width <= 1280);
    assert.ok(video.height <= 720);
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

test("compressExerciseVideo rejects corrupt input and leaves no temp exercise-media dirs", { skip: !(await hasBinary("ffmpeg")) }, async () => {
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("exercise-media-")));
  await assert.rejects(() => compressExerciseVideo(Buffer.from("not a video")));
  const after = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("exercise-media-")));
  assert.deepEqual(after, before);
});
