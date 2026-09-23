import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Tripwire for one specific, repeatedly-shipped bug: a query that names a column
 * the database does not have.
 *
 * Every instance found on 2026-09-05 failed the same way — PostgREST rejects the
 * request, the caller discards the error, and the feature is silently dead:
 *
 *   readings.updated_at              "Continue reading" permanently empty
 *   profiles.onboarding_completed_at reader onboarding returned HTTP 500
 *   poll_options.created_at          poll options never loaded
 *   chapters.sort_order              AI book-snapshot excerpt always empty
 *   marketing_campaigns.user_id      social publish always failed its own check
 *
 * None of these were caught by TypeScript, because the offending calls either
 * cast the table `as never` or read a column off an untyped row.
 */

const SRC = join(__dirname, "..", "..");
const TYPES = join(__dirname, "types.ts");

/**
 * Columns that ARE live but missing from types.ts, which is generated and has
 * drifted. Verified against the LIVE DATABASE, not the migrations — the two
 * entries that used to live here (`orders.chapter_id`, `entitlements.chapter_id`)
 * were justified "verified against migrations", and the migration in question
 * had never actually run. Neither column existed, so this allowlist was
 * suppressing a real bug rather than a false positive: it hid the 400 that made
 * reader order history render empty and, worse, made every paid-book entitlement
 * check fail closed. Both columns are live as of 2026-09-07 and now present in
 * types.ts, so nothing needs excusing.
 *
 * Add an entry only after probing the live database for the column. Remove it
 * when types.ts is regenerated rather than leaving it to rot.
 */
const KNOWN_TYPES_DRIFT = new Set<string>([]);

/** Columns a query may always name; PostgREST synthesises or accepts them. */
const ALWAYS_OK = new Set(["*", "count"]);

function tableColumns(): Map<string, Set<string>> {
  const types = readFileSync(TYPES, "utf8");
  const out = new Map<string, Set<string>>();
  const re = /\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g;
  for (let m = re.exec(types); m; m = re.exec(types)) {
    const cols = new Set([...m[2].matchAll(/^\s+(\w+)\??:/gm)].map((c) => c[1]));
    if (cols.size > 0) out.set(m[1], cols);
  }
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && entry !== "types.ts") {
      acc.push(full);
    }
  }
  return acc;
}

describe("queries only name columns the schema has", () => {
  it("finds no reference to a column absent from types.ts", () => {
    const schema = tableColumns();
    expect(schema.size).toBeGreaterThan(50);

    const violations: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\.from\(\s*"(\w+)"(?:\s+as\s+never)?\s*\)/g)) {
        const table = m[1];
        const columns = schema.get(table);
        if (!columns) continue; // untyped table — types.ts cannot adjudicate

        // Only the chained calls before the next `.from(` belong to this query.
        const chunk = src.slice(m.index! + m[0].length).split(".from(")[0].slice(0, 600);

        const referenced = new Set<string>();
        for (const sel of chunk.matchAll(/\.select\(\s*"([^"]+)"/g)) {
          for (const raw of sel[1].split(",")) {
            const col = raw.trim().split("(")[0].split(":").pop()!.trim();
            // `genres(name)` names an embedded RESOURCE, not a column.
            if (/\w+\s*\(/.test(raw.trim())) continue;
            if (/^\w+$/.test(col)) referenced.add(col);
          }
        }
        for (const f of chunk.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|is|in)\(\s*"(\w+)"/g)) {
          referenced.add(f[1]);
        }

        for (const col of referenced) {
          if (ALWAYS_OK.has(col)) continue;
          if (columns.has(col)) continue;
          if (schema.has(col)) continue; // embedded resource named like a table
          if (KNOWN_TYPES_DRIFT.has(`${table}.${col}`)) continue;
          const line = src.slice(0, m.index!).split("\n").length;
          violations.push(`${file.replace(SRC, "src")}:${line}  ${table}.${col}`);
        }
      }
    }

    expect(violations, `\n${violations.join("\n")}\n`).toEqual([]);
  });
});
