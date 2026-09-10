/**
 * Fail if the chapters paywall can be read around.
 *
 *   npm run check:rls-paywall              # report only, exit 0
 *   npm run check:rls-paywall -- --strict  # exit 1 on any error
 *
 * Why this exists
 * ---------------
 * On 2026-09-10 anon could fetch the complete text of a 49 kr book with one
 * curl. The SELECT policy the migrations define was correct. It did not
 * matter: two more permissive SELECT policies existed on `public.chapters`,
 * written by hand in the Supabase dashboard, present in no migration, each
 * granting every chapter of any book whose `books.status` said PUBLISHED —
 * no price check, no version check.
 *
 * PERMISSIVE policies OR together. One correct policy plus one careless one
 * equals the careless one. So "the policy in git is right" proves nothing,
 * and reviewing the diff could never have caught this. The only fact that
 * matters is how many permissive SELECT policies the live table actually has.
 *
 * Two independent checks, because either alone can pass while the paywall is
 * open:
 *
 *   1. Shape — exactly one PERMISSIVE SELECT policy on chapters. Catches a new
 *      dashboard policy the moment it appears, without needing a paid book to
 *      exist.
 *   2. Behaviour — the anon key cannot read chapters of any published paid
 *      book. Catches a policy that is single but wrong. Skipped with a clear
 *      message when nothing paid is published, which is the normal state.
 *
 * A skip is not a pass: without credentials it reports SKIPPED and, under
 * --strict, exits 1.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const strict = process.argv.includes("--strict");

for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const problems: string[] = [];

function skip(reason: string): never {
  console.log(`⚠  SKIPPED — ${reason}`);
  if (strict) {
    console.error(`   --strict: a skip is not a pass.\n`);
    process.exit(1);
  }
  console.log("");
  process.exit(0);
}

type PolicyRow = {
  policyname: string;
  cmd: string;
  permissive: string;
  roles: string[];
  qual: string | null;
};

async function main() {
  console.log(`\n══ RLS paywall check ══\n`);

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    skip("missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const svc = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  const anon = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  };

  // ── 1. Shape ──────────────────────────────────────────────────────────────
  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/policy_inventory`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ p_table: "chapters" }),
  });

  if (!invRes.ok) {
    const body = await invRes.text();
    if (invRes.status === 404) {
      skip(
        "public.policy_inventory() is missing — run `cd apps/web && npx supabase db push` " +
          "(migration 20260910150000)"
      );
    }
    console.error(`✖  policy_inventory failed: HTTP ${invRes.status} ${body.slice(0, 200)}\n`);
    process.exit(strict ? 1 : 0);
  }

  const policies = (await invRes.json()) as PolicyRow[];
  const selects = policies.filter((p) => p.cmd === "SELECT");
  const permissive = selects.filter((p) => p.permissive === "PERMISSIVE");
  const restrictive = selects.filter((p) => p.permissive === "RESTRICTIVE");

  console.log(`chapters SELECT policies: ${permissive.length} permissive, ${restrictive.length} restrictive`);
  for (const p of selects) {
    const mark = p.permissive === "PERMISSIVE" ? "•" : "·";
    console.log(`   ${mark} [${p.permissive}] ${p.policyname}  roles=${p.roles.join(",")}`);
  }

  if (permissive.length > 1) {
    problems.push(
      `chapters has ${permissive.length} PERMISSIVE SELECT policies. They OR together, so the ` +
        `strictest one is irrelevant — any of the others can hand out paid chapters. ` +
        `Extra: ${permissive.map((p) => `"${p.policyname}"`).join(", ")}`
    );
  } else if (permissive.length === 0) {
    problems.push(
      "chapters has NO permissive SELECT policy. Nothing can read chapters, including buyers " +
        "and the authors who wrote them."
    );
  }

  // The paying half of the rule. A policy that never mentions entitlements is
  // one that cannot charge for anything.
  const paywallAware = permissive.some(
    (p) => p.qual?.includes("has_book_entitlement") || p.qual?.includes("entitlements")
  );
  if (permissive.length === 1 && !paywallAware) {
    problems.push(
      `the single permissive SELECT policy ("${permissive[0].policyname}") never consults ` +
        `entitlements, so a published paid book is readable by anyone.`
    );
  }

  if (restrictive.length === 0) {
    console.log(
      `   note: no restrictive SELECT policy. chapters_hide_soft_deleted used to be one; ` +
        `if soft delete is still a thing, it is not being enforced here.`
    );
  }

  // ── 2. Behaviour ──────────────────────────────────────────────────────────
  const paidRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,price_amount&published=is.true&price_amount=gt.0&limit=1`,
    { headers: svc }
  );
  const paidBooks = paidRes.ok ? ((await paidRes.json()) as Array<{ id: string; title: string }>) : [];

  if (paidBooks.length === 0) {
    console.log(`\nbehaviour check: no published paid book exists, so there is nothing to probe.`);
    console.log(`   (the shape check above is what guards the paywall in this state)`);
  } else {
    const book = paidBooks[0];
    const leak = await fetch(
      `${SUPABASE_URL}/rest/v1/chapters?select=id&book_id=eq.${book.id}&limit=1`,
      { headers: anon }
    );
    const rows = leak.ok ? ((await leak.json()) as unknown[]) : [];
    if (rows.length > 0) {
      problems.push(
        `anon read a chapter of the published PAID book "${book.title}" (${book.id}). ` +
          `The paywall is open right now.`
      );
    } else {
      console.log(`\nbehaviour check: anon reads 0 chapters of the paid book "${book.title}" ✓`);
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  if (problems.length === 0) {
    console.log(`\n✅ paywall intact\n`);
    process.exit(0);
  }

  console.log(`\n❌ ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.log(`   • ${p}\n`);
  if (!strict) console.log(`Reporting only — pass --strict to fail on these.\n`);
  process.exit(strict ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖  check crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(strict ? 1 : 0);
});
