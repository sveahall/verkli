import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("node:url", async (original) => ({
  ...await original<typeof import("node:url")>(),
  fileURLToPath: vi.fn(),
}));

describe("worker environment loading", () => {
  let directory: string;

  beforeEach(() => {
    vi.resetModules();
    directory = mkdtempSync(path.join(tmpdir(), "verkli-worker-env-"));
    mkdirSync(path.join(directory, "scripts"));
    vi.mocked(fileURLToPath).mockReturnValue(path.join(directory, "scripts/load-dotenv.ts"));
    vi.stubEnv("REDIS_URL", undefined);
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("preserves an explicit isolated queue and database when local defaults exist", async () => {
    writeFileSync(path.join(directory, ".env.local"), "REDIS_URL=redis://default.invalid:6379\nSUPABASE_URL=https://default.invalid\n");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6394");
    vi.stubEnv("SUPABASE_URL", "https://isolated.invalid");

    await import("./load-dotenv");

    expect(process.env.REDIS_URL).toBe("redis://127.0.0.1:6394");
    expect(process.env.SUPABASE_URL).toBe("https://isolated.invalid");
  });

  it("loads missing worker settings from the web app's local file", async () => {
    writeFileSync(path.join(directory, ".env.local"), "REDIS_URL=redis://default.invalid:6379\n");

    await import("./load-dotenv");

    expect(process.env.REDIS_URL).toBe("redis://default.invalid:6379");
  });

  it("starts with the supplied environment when no local file exists", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6394");

    await import("./load-dotenv");

    expect(process.env.REDIS_URL).toBe("redis://127.0.0.1:6394");
    expect(process.env.SUPABASE_URL).toBeUndefined();
  });
});
