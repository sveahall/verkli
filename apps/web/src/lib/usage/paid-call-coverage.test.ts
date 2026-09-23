import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Every module that calls a paid provider must also record what it cost.
 *
 * This exists because six of them did not. The meter was built against the
 * call sites that existed at the time; parallel work then added whole-book
 * analysis, an agent loop, a translation-quality pass, a Higgsfield video
 * render and a NIM translator, and every one of them spent real money in
 * silence. Nothing failed, nothing warned — the rows simply were not there,
 * which is the one failure mode a usage ledger cannot survive.
 *
 * A unit test of the meter cannot catch this: the meter was correct. What was
 * missing was a caller. So this walks the source for the network calls that
 * cost money and asserts each file also reaches the meter.
 */
const srcDir = path.resolve(__dirname, "../..");
const libDir = path.resolve(__dirname, "..");

/** Distinctive markers for "this line spends money at a vendor". */
const PAID_CALL = [
  "messages\\.create\\(",
  "callOpenAi\\(",
  "\\.synthesize\\(",
  "generateCoverImages\\(",
  "generateImageToVideo\\(",
  "integrate\\.api\\.nvidia\\.com",
  "api\\.elevenlabs\\.io/v1/text-to-speech",
  "fal\\.run",
].join("|");

/**
 * Files that legitimately mention a paid endpoint without spending:
 * the meter's own modules, the key-validity probe, quota reads, and
 * modules nothing imports.
 */
const EXEMPT = new Set([
  "usage/provider-health.ts",
  "tts/elevenlabs-quota.ts",
  "tts/elevenlabs-voice-cloning.ts", // imported by nothing; verified dead
  // Returns its own usage block and its single caller records it. Verified
  // below rather than trusted: if that route stops metering, this fails.
  "ai/writing-assistant.ts",
]);

/**
 * The one exemption that depends on a caller keeping its side of the bargain.
 * `writing-assistant` hands its usage back instead of recording it, so the
 * exemption above is only safe while the chat route still meters.
 */
const DELEGATED = [
  { module: "ai/writing-assistant.ts", meteredBy: "../app/api/books/[id]/ai/chat/route.ts" },
];

function paidCallFiles(): string[] {
  let out = "";
  try {
    out = execSync(
      `grep -rlE '${PAID_CALL}' ${JSON.stringify(libDir)} --include='*.ts' || true`,
      { encoding: "utf8" }
    );
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((f) => path.relative(libDir, f))
    .filter((f) => !f.endsWith(".test.ts") && !EXEMPT.has(f));
}

describe("paid provider calls are metered", () => {
  it("finds the paid call sites at all", () => {
    // Guards the guard: a broken pattern would make this suite pass by
    // finding nothing, which is exactly how it would stop protecting anything.
    expect(paidCallFiles().length).toBeGreaterThan(5);
  });

  it("the delegated modules' callers still record on their behalf", () => {
    for (const { module, meteredBy } of DELEGATED) {
      const caller = readFileSync(path.join(libDir, meteredBy), "utf8");
      expect(
        /recordUsage/.test(caller),
        `${module} is exempt because ${meteredBy} meters for it — and that route no longer does.`
      ).toBe(true);
    }
  });

  it("every module that spends money also reaches the meter", () => {
    const unmetered = paidCallFiles().filter((rel) => {
      const body = readFileSync(path.join(libDir, rel), "utf8");
      return !/recordUsage|MeterContext/.test(body);
    });

    expect(
      unmetered,
      `These modules call a paid provider but never reach the usage meter, so ` +
        `their spend is invisible:\n  ${unmetered.join("\n  ")}\n\n` +
        `Either thread a \`meter?: MeterContext\` through and call ` +
        `recordUsage, or add the file to EXEMPT with a reason.`
    ).toEqual([]);
  });
});
