import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import en from "../../../messages/en.json";
import sv from "../../../messages/sv.json";

/**
 * What these guard, found 2026-09-04.
 *
 * The author UI had two translation systems. next-intl (these files) resolved
 * the language from an explicit NEXT_LOCALE cookie and defaulted to English,
 * while a second module, lib/author-locale.tsx, resolved it from
 * `navigator.language` — so an author whose browser was Swedish saw four
 * Swedish strings inside an otherwise English dashboard, without ever having
 * chosen Swedish. The second system is gone; these tests keep one from growing
 * back by accident.
 *
 * The other half of the mess was dead weight: of 46 keys here, 22 —
 * `author.nav.*` and `author.common.*` — were referenced by nothing at all.
 * They made the dictionary look like the dashboard was translated when only
 * the payouts page was.
 */

const MESSAGES_DIR = path.join(__dirname, "../../../messages");
const SRC_DIR = path.join(__dirname, "../..");

function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key)
  );
}

/** Top-level namespaces a component would pass to useTranslations/getTranslations. */
function namespaces(messages: unknown): string[] {
  const groups = new Set<string>();
  for (const key of flatten(messages)) {
    const parts = key.split(".");
    // author.billing.payouts.title -> author.billing.payouts
    if (parts.length > 1) groups.add(parts.slice(0, -1).join("."));
  }
  return [...groups];
}

function isReferenced(namespace: string): boolean {
  // A namespace counts as used if any component asks for it, or for one of its
  // parents (`useTranslations("author")` then `t("library.title")`).
  const candidates = namespace
    .split(".")
    .map((_, i, parts) => parts.slice(0, i + 1).join("."));

  return candidates.some((candidate) => {
    try {
      execFileSync(
        "grep",
        // The closing quote matters: without it, `Translations("author"` also
        // matches `Translations("author.library")`, and every namespace under
        // author would look used. That is how the first version of this test
        // passed while a deliberately dead group sat in the file.
        [
          "-rq",
          "-e",
          `Translations("${candidate}")`,
          "--include=*.ts",
          "--include=*.tsx",
          SRC_DIR,
        ],
        { stdio: "ignore" }
      );
      return true;
    } catch {
      return false;
    }
  });
}

describe("message catalogues", () => {
  it("keeps every language on exactly the same keys", () => {
    const enKeys = flatten(en).sort();
    const svKeys = flatten(sv).sort();

    // A key present in one language and not the other silently falls back,
    // which reads as a half-translated screen rather than an error.
    expect(svKeys).toEqual(enKeys);
  });

  it("has no namespace that nothing asks for", () => {
    const dead = namespaces(en).filter((ns) => !isReferenced(ns));

    expect(dead).toEqual([]);
  });

  it("ships a catalogue for every locale the request config supports", async () => {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));

    // lib/i18n/request.ts imports `messages/<locale>.json` directly, so a
    // supported locale without a file is a runtime crash, not a fallback.
    expect(files.sort()).toEqual(["en.json", "sv.json"]);
  });
});
