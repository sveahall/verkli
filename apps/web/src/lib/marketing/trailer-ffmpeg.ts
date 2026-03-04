import "server-only";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { FFMPEG_CONCAT_OUTPUT_OPTIONS } from "./trailer-ffmpeg-options";

type FfmpegCommand = {
  input: (value: string) => FfmpegCommand;
  inputOptions: (value: string[]) => FfmpegCommand;
  outputOptions: (value: string[]) => FfmpegCommand;
  on: ((event: "end", listener: () => void) => FfmpegCommand) &
    ((event: "error", listener: (error: unknown) => void) => FfmpegCommand);
  save: (outputPath: string) => void;
};

type FfmpegFactory = (() => FfmpegCommand) & {
  setFfmpegPath: (binaryPath: string) => void;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require("ffmpeg-static") as string | null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require("fluent-ffmpeg") as FfmpegFactory;

const MAX_SCENE_COUNT = 3;

function formatConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

async function downloadSceneVideoToFile(
  sceneUrl: string,
  outputPath: string,
  index: number
): Promise<void> {
  const response = await fetch(sceneUrl);
  if (!response.ok) {
    throw new Error(
      `[trailer build] scene ${index} download failed with status ${response.status}.`
    );
  }

  const sceneBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(sceneBuffer));
}

async function concatVideosToMp4(
  concatListPath: string,
  outputPath: string
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("[trailer build] ffmpeg-static binary path is missing.");
  }

  ffmpeg.setFfmpegPath(ffmpegPath);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(FFMPEG_CONCAT_OUTPUT_OPTIONS)
      .on("end", () => resolve())
      .on("error", (error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error);
        reject(new Error(`[trailer build] ffmpeg concat failed: ${message}`));
      })
      .save(outputPath);
  });
}

export async function stitchSceneVideos(sceneVideoUrls: string[]): Promise<Buffer> {
  if (sceneVideoUrls.length === 0) {
    throw new Error("[trailer build] No scene video URLs to stitch.");
  }
  if (sceneVideoUrls.length > MAX_SCENE_COUNT) {
    throw new Error(
      `[trailer build] Too many scene videos (${sceneVideoUrls.length}). Max is ${MAX_SCENE_COUNT}.`
    );
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "verkli-trailer-build-"));
  try {
    const scenePaths = sceneVideoUrls.map((_, index) =>
      path.join(tempDir, `scene-${index + 1}.mp4`)
    );
    const concatListPath = path.join(tempDir, "concat.txt");
    const outputPath = path.join(tempDir, "final.mp4");

    await Promise.all(
      sceneVideoUrls.map((sceneUrl, index) =>
        downloadSceneVideoToFile(sceneUrl, scenePaths[index], index + 1)
      )
    );

    const concatFile = scenePaths
      .map((scenePath) => `file '${formatConcatPath(scenePath)}'`)
      .join("\n");
    await writeFile(concatListPath, `${concatFile}\n`, "utf8");

    await concatVideosToMp4(concatListPath, outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
