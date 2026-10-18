import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TARGET_MAX_WIDTH = 960;
export const TARGET_MAX_HEIGHT = 540;
export const CRF = 28;
export const MAXRATE_KBPS = 1200;
export const BUFSIZE_KBPS = 2400;

export function buildEncodeArgs(inputPath, outputPath) {
  return ["-y", "-i", inputPath, "-vf",
    `scale='min(${TARGET_MAX_WIDTH},iw)':'min(${TARGET_MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(CRF),
    "-maxrate", `${MAXRATE_KBPS}k`, "-bufsize", `${BUFSIZE_KBPS}k`,
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", outputPath];
}

export async function probeVideo(input) {
  const dir = Buffer.isBuffer(input) ? await mkdtemp(join(tmpdir(), "exercise-probe-")) : null;
  try {
    const path = dir ? join(dir, "input") : input;
    if (dir) await writeFile(path, input);
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
    const result = JSON.parse(stdout);
    const video = result.streams?.find(stream => stream.codec_type === "video");
    if (!video) throw new Error("No video stream found");
    return {
      codec: video.codec_name, pixFmt: video.pix_fmt, width: video.width, height: video.height,
      hasAudio: result.streams.some(stream => stream.codec_type === "audio"),
      bitRate: Number(video.bit_rate ?? result.format?.bit_rate) || null,
      durationSec: Number(result.format?.duration ?? video.duration) || null,
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

export async function compressExerciseVideo(inputBuffer) {
  return processVideo(inputBuffer, buildEncodeArgs);
}

export async function remuxFaststart(inputBuffer) {
  return processVideo(inputBuffer, (input, output) => [
    "-y", "-i", input, "-c", "copy", "-movflags", "+faststart", "-an", output,
  ]);
}

async function processVideo(inputBuffer, argsBuilder) {
  const dir = await mkdtemp(join(tmpdir(), "exercise-media-"));
  const inputPath = join(dir, "source-upload");
  const outputPath = join(dir, "compressed.mp4");
  const posterPath = join(dir, "poster.jpg");

  try {
    await writeFile(inputPath, inputBuffer);
    await execFileAsync("ffmpeg", argsBuilder(inputPath, outputPath));
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      "0.1",
      "-i",
      outputPath,
      "-frames:v",
      "1",
      posterPath,
    ]);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      outputPath,
    ]);
    const durationSec = Number.parseFloat(String(stdout).trim());
    if (!Number.isFinite(durationSec)) {
      throw new Error("ffprobe did not return a valid duration");
    }

    return {
      compressedBuffer: await readFile(outputPath),
      posterBuffer: await readFile(posterPath),
      durationSec,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
