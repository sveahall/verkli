import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../..");
const script = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["check:no-prisma"];
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("no-Prisma release check", () => {
  it.each([null, "prisma", "@prisma/client"])("checks an installation containing %s", (dependency) => {
    const cwd = mkdtempSync(join(tmpdir(), "verkli-no-prisma-"));
    directories.push(cwd);
    if (dependency) mkdirSync(join(cwd, "node_modules", dependency), { recursive: true });
    const result = spawnSync(script, { cwd, shell: true, encoding: "utf8" });
    expect(result.status).toBe(dependency ? 1 : 0);
  });
});
