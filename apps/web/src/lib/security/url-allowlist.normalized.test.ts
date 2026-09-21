import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The allowlist returns a PARSED url so callers forward exactly what was
 * checked. Forwarding the raw string instead re-opens the hole the check
 * exists to close: our parser and the provider's need not agree.
 *
 * `https://ours.supabase.co\@evil.example/x.png` parses here with hostname
 * `ours.supabase.co` — Node folds the backslash into a slash. A lenient client
 * on the provider's side can read `\@evil.example` as userinfo@host and fetch
 * from evil.example instead. Same string, two hosts.
 */

const ALLOWED_HOST = "glfipbnsyxowqsmcuzcm.supabase.co";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${ALLOWED_HOST}`;
});

describe("validateProviderImageUrl returns a normalised url", () => {
  it("folds a backslash host confusable, so raw and checked differ", async () => {
    const { validateProviderImageUrl } = await import("./url-allowlist");
    const raw = `https://${ALLOWED_HOST}\\@evil.example/x.png`;
    const outcome = validateProviderImageUrl(raw);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.url.hostname).toBe(ALLOWED_HOST);
    // The point of the fix: these are not the same string.
    expect(outcome.url.toString()).not.toBe(raw);
    expect(outcome.url.toString()).not.toContain("\\");
  });

  it("collapses path traversal", async () => {
    const { validateProviderImageUrl } = await import("./url-allowlist");
    const outcome = validateProviderImageUrl(
      `https://${ALLOWED_HOST}/storage/../../evil/x.png`
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.url.toString()).toBe(`https://${ALLOWED_HOST}/evil/x.png`);
  });

  it("still rejects a host that is not on the list", async () => {
    const { validateProviderImageUrl } = await import("./url-allowlist");
    expect(validateProviderImageUrl("https://evil.example/x.png").ok).toBe(false);
  });
});

/**
 * Source guard. Every call site must hand the provider `check.url.toString()`,
 * never the column it validated. Three sites already did; two did not, which is
 * what this change fixes. vitest cannot execute those routes cheaply — they
 * reach Supabase, Stripe and the video provider — so this asserts the shape.
 *
 * The list is discovered, not hardcoded, so a new call site is covered the day
 * it is written rather than the day someone remembers to add it here.
 */
describe("no call site forwards the raw url", () => {
  const SRC = join(__dirname, "..", "..");

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
      return [full];
    });

  const callSites = walk(SRC).filter((file) => {
    if (file.endsWith(join("lib", "security", "url-allowlist.ts"))) return false;
    return readFileSync(file, "utf8").includes("validateProviderImageUrl(");
  });

  it("finds the call sites at all", () => {
    expect(callSites.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of callSites) {
    const label = file.slice(SRC.length + 1);
    it(`${label} passes the validated url through`, () => {
      const src = readFileSync(file, "utf8");
      // Whatever it forwards must not be the unvalidated column or argument.
      expect(src).not.toMatch(/imageUrl:\s*(book|ownedBook)\.cover_image\s*,/);
      expect(src).not.toMatch(/imageUrl:\s*coverImageUrl\s*,/);
      // And it must forward something derived from the outcome.
      expect(src).toMatch(/\.url\.toString\(\)/);
    });
  }
});
