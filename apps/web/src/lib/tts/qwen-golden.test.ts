import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const RUN_GOLDEN = process.env.RUN_QWEN_TTS_GOLDEN === "1";

function parseLastJsonLine(stdout: string): Record<string, unknown> {
  const lines = stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed;
    } catch {
      // Keep scanning older lines.
    }
  }

  throw new Error("No JSON metadata found in synth stdout.");
}

function readWavInfo(buffer: Buffer): { sampleRate: number; durationSec: number } {
  if (buffer.length < 44) {
    return { sampleRate: 0, durationSec: 0 };
  }
  const sampleRate = buffer.readUInt32LE(24);
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = Math.max(0, buffer.length - 44);
  const durationSec = byteRate > 0 ? dataSize / byteRate : 0;
  return { sampleRate, durationSec };
}

function runSynthesis(cmd: string, args: string[], text: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Synth exited with code ${code}: ${stderr.slice(-1000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    proc.stdin.end(text, "utf8");
  });
}

describe("Qwen TTS golden smoke", () => {
  const maybeIt = RUN_GOLDEN ? it : it.skip;

  maybeIt(
    "generates non-empty wav with stable sample rate and duration bounds",
    async () => {
      const repoRoot = path.resolve(process.cwd(), "..", "..");
      const pythonPath =
        process.env.QWEN_TTS_PYTHON ??
        path.join(repoRoot, "qwen3tts-env", "bin", "python3.12");
      const synthScript =
        process.env.QWEN_TTS_SCRIPT ??
        path.join(repoRoot, "apps", "web", "scripts", "qwen_tts_synthesize.py");
      const modelId =
        process.env.QWEN_TTS_MODEL ??
        process.env.AI_NARRATOR_MODEL ??
        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";

      if (!existsSync(pythonPath)) {
        throw new Error(`Python binary not found: ${pythonPath}`);
      }
      if (!existsSync(synthScript)) {
        throw new Error(`Synth script not found: ${synthScript}`);
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-golden-"));
      const outWav = path.join(tmpDir, "golden.wav");
      const testText = "Detta ar ett kort golden test for Qwen TTS pipeline.";

      try {
        const { stdout } = await runSynthesis(
          pythonPath,
          [
            synthScript,
            "--output",
            outWav,
            "--model-id",
            modelId,
            "--language",
            "auto",
            "--speaker",
            process.env.QWEN_TTS_VOICE_ID ?? "Ryan",
            "--max-chars",
            "350",
            "--batch-size",
            "1",
            "--max-new-tokens",
            process.env.QWEN_TTS_MAX_NEW_TOKENS ?? "512",
            "--xvector-only",
            "1",
            "--clone-non-streaming-mode",
            "0",
          ],
          testText
        );

        const metadata = parseLastJsonLine(stdout);
        const wavBuffer = await fs.readFile(outWav);
        const { sampleRate, durationSec } = readWavInfo(wavBuffer);

        expect(wavBuffer.length).toBeGreaterThan(44);
        expect(sampleRate).toBeGreaterThan(8000);
        const metaSampleRate =
          typeof metadata.sampleRate === "number" ? metadata.sampleRate : null;
        if (metaSampleRate !== null) {
          expect(sampleRate).toBe(metaSampleRate);
        }

        const expectedDurationSec = 3.0;
        const toleranceSec = 8.0;
        expect(durationSec).toBeGreaterThan(0.4);
        expect(Math.abs(durationSec - expectedDurationSec)).toBeLessThanOrEqual(toleranceSec);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    10 * 60 * 1000
  );
});
