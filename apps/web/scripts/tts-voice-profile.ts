import "./load-dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

type VoiceProfile = {
  speaker?: string;
  refAudio?: string;
  refText?: string;
  prompt?: string;
  updatedAt: string;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(SCRIPT_DIR, "tts-voice-profiles.json");

function usage(): string {
  return [
    "Usage:",
    "  npm run tts-voice-profile -- --name <profile> [--speaker Ryan] [--ref-audio /abs/path.wav] [--ref-text \"...\"] [--prompt \"...\"]",
    "  npm run tts-voice-profile -- --list",
    "  npm run tts-voice-profile -- --delete <profile>",
  ].join("\n");
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i++;
  }
  return out;
}

function sanitizeOptional(raw: string | boolean | undefined, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLen) return null;
  return value;
}

async function readProfiles(filePath: string): Promise<Record<string, VoiceProfile>> {
  if (!existsSync(filePath)) return {};
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as Record<string, VoiceProfile>;
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

async function writeProfiles(filePath: string, profiles: Record<string, VoiceProfile>): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }

  const filePath = DEFAULT_FILE;
  const profiles = await readProfiles(filePath);

  if (args.list) {
    console.log(JSON.stringify(profiles, null, 2));
    return;
  }

  const deleteName = sanitizeOptional(args.delete as string | undefined, 64);
  if (deleteName) {
    if (!profiles[deleteName]) {
      throw new Error(`[tts voice profile] profile not found: ${deleteName}`);
    }
    delete profiles[deleteName];
    await writeProfiles(filePath, profiles);
    console.log(`[tts voice profile] deleted ${deleteName}`);
    return;
  }

  const name = sanitizeOptional(args.name as string | undefined, 64);
  if (!name) {
    throw new Error(`[tts voice profile] --name is required\n${usage()}`);
  }

  const speaker = sanitizeOptional(args.speaker as string | undefined, 64);
  const refAudio = sanitizeOptional(args["ref-audio"] as string | undefined, 512);
  const refText = sanitizeOptional(args["ref-text"] as string | undefined, 240);
  const prompt = sanitizeOptional(args.prompt as string | undefined, 240);

  if (refAudio) {
    const resolved = path.isAbsolute(refAudio) ? refAudio : path.resolve(process.cwd(), refAudio);
    if (!existsSync(resolved)) {
      throw new Error(`[tts voice profile] ref audio missing: ${resolved}`);
    }
    profiles[name] = {
      ...profiles[name],
      speaker: speaker ?? profiles[name]?.speaker ?? "Ryan",
      refAudio: resolved,
      refText: refText ?? profiles[name]?.refText,
      prompt: prompt ?? profiles[name]?.prompt,
      updatedAt: new Date().toISOString(),
    };
  } else {
    profiles[name] = {
      ...profiles[name],
      speaker: speaker ?? profiles[name]?.speaker ?? "Ryan",
      refText: refText ?? profiles[name]?.refText,
      prompt: prompt ?? profiles[name]?.prompt,
      updatedAt: new Date().toISOString(),
    };
  }

  await writeProfiles(filePath, profiles);
  console.log(`[tts voice profile] saved ${name} in ${filePath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
