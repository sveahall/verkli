import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

function isAudiobookEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED ?? process.env.AUDIOBOOK_ENABLED;
  if (value === undefined || value === "") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

async function ensureDirectoryExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // If directory already exists or another process created it, ignore EEXIST
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function assertFileExists(filePath: string) {
  try {
    await fs.access(filePath);
  } catch (error) {
    const err = new Error(`Required file does not exist: ${filePath}`, {
      cause: error instanceof Error ? error : undefined,
    });
    throw err;
  }
}

function runPiperTTS(text: string, outputPath: string, modelPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["--model", modelPath, "--output_file", outputPath];

    const child = spawn("piper", args);

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const err = new Error(`Failed to start piper process: ${error.message}`, {
        cause: error,
      });
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`piper exited with code ${code}. Stderr: ${stderr}`);
        reject(err);
      } else {
        resolve();
      }
    });

    // Write the text to stdin and close it
    child.stdin.write(text);
    child.stdin.end();
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { bookId: string } }
) {
  if (!isAudiobookEnabled()) {
    return NextResponse.json(
      { error: "Audiobook generation is temporarily unavailable in this environment" },
      { status: 503 }
    );
  }

  const bookId = params?.bookId;

  if (!bookId || typeof bookId !== "string" || !bookId.trim()) {
    return NextResponse.json(
      { error: "Invalid bookId parameter" },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse JSON body for audiobook generation:", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const text = (body as { text?: unknown })?.text;

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "Invalid input: \"text\" must be a non-empty string" },
      { status: 400 }
    );
  }

  const projectRoot = process.cwd();
  const audiobooksDir = path.join(projectRoot, "public", "audiobooks");
  const outputFilePath = path.join(audiobooksDir, `${bookId}.wav`);
  const publicPath = `/audiobooks/${bookId}.wav`;

  // Resolve Piper model path:
  // Prefer explicit environment variable, otherwise fall back to a conventional location.
  const modelPath =
    process.env.PIPER_MODEL_PATH ??
    path.join(projectRoot, "models", "piper", "en_US-lessac-medium.onnx");

  try {
    await ensureDirectoryExists(audiobooksDir);
  } catch (error) {
    console.error(
      "Failed to ensure audiobooks directory exists:",
      error
    );
    return NextResponse.json(
      { error: "Failed to prepare filesystem for audiobook generation" },
      { status: 500 }
    );
  }

  try {
    await assertFileExists(modelPath);
  } catch (error) {
    console.error(
      "Piper model file is missing or not accessible:",
      error
    );
    return NextResponse.json(
      { error: "TTS model is not available on the server" },
      { status: 500 }
    );
  }

  try {
    await runPiperTTS(text, outputFilePath, modelPath);
  } catch (error) {
    console.error(
      "TTS generation failed while running Piper:",
      error
    );
    return NextResponse.json(
      { error: "Failed to generate audiobook" },
      { status: 500 }
    );
  }

  console.log(
    `Audiobook generated successfully for bookId="${bookId}" at "${outputFilePath}"`
  );

  return NextResponse.json({
    success: true,
    path: publicPath,
  });
}
