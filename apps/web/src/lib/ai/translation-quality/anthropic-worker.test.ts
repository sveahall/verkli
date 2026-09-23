import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("loads the quality adapter in the standalone Node worker without Next.js aliases", () => {
  const modulePath = fileURLToPath(new URL("./anthropic.ts", import.meta.url));
  const output = execFileSync(process.execPath, [
    "--import", "tsx", "--eval",
    `process.stdout.write(typeof require(${JSON.stringify(modulePath)}).createAuthorProfile)`,
  ], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
  expect(output).toBe("function");
});
