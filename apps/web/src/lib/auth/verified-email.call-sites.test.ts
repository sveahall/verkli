import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An email address is a claim until Supabase confirms it. Anywhere it is used
 * as the KEY to something that already exists — looking up a Stripe customer,
 * adopting its subscription — it has to be the confirmed one.
 *
 * `listStripeCustomersByEmail` is that key. Three call sites reached it with
 * `user.email` straight off the session; they now go through
 * `getConfirmedEmail`. Today the confirmation link gates both signup flows, so
 * there is no live path — but that guarantee lives in a Supabase dashboard
 * toggle, not in this repo, and nothing here would notice if it were switched
 * off.
 *
 * The call sites are discovered rather than listed, so a new one is covered the
 * day it is written.
 */

const SRC = join(__dirname, "..", "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [full];
  });

const callSites = walk(SRC).filter((file) => {
  if (file.includes(join("lib", "payments"))) return false; // the definition
  return readFileSync(file, "utf8").includes("listStripeCustomersByEmail(");
});

describe("email-keyed Stripe lookups use the confirmed address", () => {
  it("finds the call sites at all", () => {
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of callSites) {
    const label = file.slice(SRC.length + 1);

    it(`${label} proves the address before using it as a key`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("getConfirmedEmail");
    });

    it(`${label} does not key the lookup on the raw session email`, () => {
      const src = readFileSync(file, "utf8");
      // The exact shape that was there before: the unproven address trimmed
      // straight into the variable the lookup is called with.
      expect(src).not.toMatch(/const email\s*=\s*\(user\.email\s*\?\?\s*""\)\.trim\(\)/);
      expect(src).not.toMatch(/listStripeCustomersByEmail\(\s*user\.email/);
    });
  }
});
