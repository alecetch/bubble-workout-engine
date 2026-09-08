import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function compressExerciseVideo(inputBuffer) {
  const dir = await mkdtemp(join(tmpdir(), "exercise-media-"));
  const inputPath = join(dir, "source-upload");
  const outputPath = join(dir, "compressed.mp4");
  const posterPath = join(dir, "poster.jpg");

  try {
    await writeFile(inputPath, inputBuffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
      "-c:v",
      "libx264",
      "-b:v",
      "2500k",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ]);
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
