/**
 * Verify that every active billing_plan_catalog row points at a Stripe price
 * that actually exists, in the mode the configured key talks to.
 *
 *   npm run check:billing-catalog              # report only, exit 0
 *   npm run check:billing-catalog -- --strict  # exit 1 on any error
 *
 * Why this exists
 * ---------------
 * The catalog held four price ids created in TEST mode while STRIPE_SECRET_KEY
 * was switched to LIVE. Every subscription checkout then died inside Stripe
 * with `No such price`, surfaced to the user as a generic 500. Nothing caught
 * it: the rows are well-formed, the ids are syntactically valid, and
 * check:launch-config only asserts that STRIPE_SECRET_KEY is *set*. Tests mock
 * Stripe. The only way to know is to ask Stripe, which is what this does.
 *
 * The tell was visible in the data the whole time: each row's `product_id`
 * named a LIVE product while its `price_id` named a TEST price. That
 * cross-check is the last assertion below, and it is the one that would have
 * failed on day one.
 *
 * A skip is not a pass. Without credentials this reports SKIPPED and, under
 * --strict, exits 1 — because a gate that goes green when it could not run is
 * how the original bug reached production in the first place.
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

type StripeMode = "live" | "test";

type CatalogRow = {
  id: string;
  role: string;
  plan_key: string;
  price_id: string;
  product_id: string | null;
  interval: string | null;
  is_active: boolean;
  /** Which Stripe mode this row's price_id belongs to; absent pre-migration. */
  livemode: boolean | null;
};

/** (role, plan, interval) the UI can reach today. Annual is optional by design:
 *  getAvailableIntervals() hides the toggle when no annual row exists. */
const REQUIRED_COMBOS = [
  { role: "author", plan_key: "pro", interval: "month" },
  { role: "reader", plan_key: "plus", interval: "month" },
];

const errors: string[] = [];

function fail(msg: string) {
  errors.push(msg);
}

/**
 * A gate that dies on a network blip is a gate people learn to ignore, and an
 * ignored gate is why the mode mismatch shipped. Transient failures retry;
 * a real answer from the server (any HTTP status) returns immediately.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

function modeOf(key: string): StripeMode | null {
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) return "live";
  if (key.startsWith("sk_test") || key.startsWith("rk_test")) return "test";
  return null;
}

function skip(reason: string): never {
  console.log("\n══ Billing catalog check ══\n");
  console.log(`⏭  SKIPPED — ${reason}`);
  console.log("   A skip is not a pass. Run this where the credentials live.\n");
  if (strict) {
    console.error("✖  --strict treats a skip as a failure.\n");
    process.exit(1);
  }
  process.exit(0);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  const missing = [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !stripeKey && "STRIPE_SECRET_KEY",
  ].filter(Boolean);
  if (missing.length > 0) skip(`missing ${missing.join(", ")}`);

  const mode = modeOf(stripeKey!);
  if (!mode) {
    console.error("\n✖  STRIPE_SECRET_KEY is neither sk_test… nor sk_live… — cannot tell which mode to expect.\n");
    process.exit(1);
  }

  // ── Catalog rows ────────────────────────────────────────────────────────────
  const catalogRes = await fetchWithRetry(
    `${supabaseUrl}/rest/v1/billing_plan_catalog?select=*&provider=eq.stripe&is_active=eq.true`,
    { headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey!}` } }
  );
  if (!catalogRes.ok) {
    console.error(`\n✖  Could not read billing_plan_catalog: HTTP ${catalogRes.status}\n`);
    process.exit(1);
  }
  const allRows = (await catalogRes.json()) as CatalogRow[];

  // Mirror src/lib/billing/catalog.ts: only rows from the key's own mode are
  // reachable, and a row with no livemode (pre-migration) matches anything.
  // Checking the other mode's rows against this key would report the very
  // "No such price" this gate exists to catch, as a false positive.
  const rows = allRows.filter(
    (r) => typeof r.livemode !== "boolean" || r.livemode === (mode === "live")
  );
  const otherMode = allRows.length - rows.length;

  console.log(`\n══ Billing catalog check — Stripe key is ${mode.toUpperCase()} mode ══\n`);
  console.log(
    `${rows.length} active ${mode}-mode row${rows.length === 1 ? "" : "s"}` +
      (otherMode > 0 ? `  (${otherMode} row${otherMode === 1 ? "" : "s"} for the other mode, not checked)` : "") +
      "\n"
  );

  if (rows.length === 0) {
    fail(
      `billing_plan_catalog has no active rows for ${mode} mode` +
        (otherMode > 0 ? ` — all ${otherMode} active rows belong to the other mode` : "") +
        ". Every subscription checkout will 500."
    );
  }

  // ── Each row against Stripe ─────────────────────────────────────────────────
  const currencies = new Set<string>();

  for (const row of rows) {
    const label = `${row.role}/${row.plan_key}/${row.interval ?? "month"}`;
    const res = await fetchWithRetry(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(row.price_id)}`,
      { headers: { Authorization: `Bearer ${stripeKey!}` } }
    );
    const price = await res.json();

    if (!res.ok) {
      // Stripe's own message distinguishes "does not exist anywhere" from
      // "exists in the other mode", which is the difference between a typo
      // and a mode mismatch. Pass it through rather than paraphrasing.
      fail(`${label} → ${row.price_id}: ${price?.error?.message ?? `HTTP ${res.status}`}`);
      console.log(`   ✖ ${label.padEnd(20)} ${row.price_id}  NOT FOUND in ${mode} mode`);
      continue;
    }

    const problems: string[] = [];
    if (price.livemode !== (mode === "live")) {
      problems.push(`livemode=${price.livemode} but the key is ${mode}`);
    }
    if (price.active !== true) problems.push("price is archived (active=false)");
    if (typeof row.livemode === "boolean" && price.livemode !== row.livemode) {
      problems.push(
        `row says livemode=${row.livemode} but Stripe says livemode=${price.livemode} — the row is mislabelled, so mode filtering will hand this price to the wrong key`
      );
    }
    if (!price.recurring) {
      problems.push("price is one-time, but this is a subscription plan");
    } else {
      const want = (row.interval ?? "month").toLowerCase();
      if (price.recurring.interval !== want) {
        problems.push(`Stripe bills /${price.recurring.interval} but the row says interval="${want}"`);
      }
    }
    // The assertion that would have caught the original bug: a row whose
    // product_id and price_id come from different Stripe modes.
    if (row.product_id && price.product && row.product_id !== price.product) {
      problems.push(
        `row.product_id=${row.product_id} but this price belongs to ${price.product} — the two columns describe different Stripe objects`
      );
    }

    if (price.currency) currencies.add(String(price.currency).toUpperCase());

    const amount =
      typeof price.unit_amount === "number"
        ? `${(price.unit_amount / 100).toFixed(2)} ${String(price.currency).toUpperCase()}`
        : "no unit_amount";
    const per = price.recurring ? `/${price.recurring.interval}` : "";

    if (problems.length === 0) {
      console.log(`   ✔ ${label.padEnd(20)} ${row.price_id}  ${amount}${per}`);
    } else {
      console.log(`   ✖ ${label.padEnd(20)} ${row.price_id}  ${amount}${per}`);
      for (const p of problems) fail(`${label}: ${p}`);
    }
  }

  // ── Coverage ────────────────────────────────────────────────────────────────
  for (const need of REQUIRED_COMBOS) {
    const has = rows.some(
      (r) =>
        r.role === need.role &&
        r.plan_key === need.plan_key &&
        (r.interval ?? "month") === need.interval
    );
    if (!has) {
      fail(
        `no active row for ${need.role}/${need.plan_key}/${need.interval} — the ${need.role} billing page offers this plan, so its button 500s.`
      );
    }
  }

  // ── Currency consistency ────────────────────────────────────────────────────
  // A mixed-currency catalog means the amount Stripe charges can differ from
  // the one the pricing page prints, per plan. That is a billing dispute, not
  // a cosmetic issue.
  if (currencies.size > 1) {
    fail(`catalog mixes currencies: ${Array.from(currencies).sort().join(", ")} — one plan will be charged in a currency the pricing page never shows.`);
  } else if (currencies.size === 1) {
    console.log(`\n   currency: ${Array.from(currencies)[0]}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log("");
  if (errors.length > 0) {
    console.error(`❌  ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) console.error(`   • ${e}\n`);
    if (!strict) console.log("Reporting only — pass --strict to fail on these.\n");
  } else {
    console.log("✔  Every active catalog row resolves to a usable Stripe price.\n");
  }

  process.exit(strict && errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖  check:billing-catalog crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
