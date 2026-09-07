/**
 * Verify the live Stripe webhook endpoint is subscribed to exactly the events
 * the code handles.
 *
 *   npm run check:stripe-webhook              # report only, exit 0
 *   npm run check:stripe-webhook -- --strict  # exit 1 on any error
 *
 * Why this exists
 * ---------------
 * A handler and a subscription are two separate facts stored in two different
 * systems, and having one without the other fails silently in both directions:
 *
 *   handler, no subscription — Stripe never sends it. The code is dead and
 *     looks alive. `charge.refunded` and `charge.dispute.created` were written,
 *     reviewed, tested and deployed while the endpoint listened to ten other
 *     events, so a refunded reader kept the book anyway.
 *   subscription, no handler — the event arrives, falls to the switch's
 *     `default`, and is answered 200 and dropped. Stripe's dashboard shows a
 *     healthy endpoint with no failures, because a 200 is a 200.
 *
 * Neither shows up in tests, a build, or Stripe's own delivery stats. The only
 * way to know is to compare the two lists, which is what this does.
 *
 * A skip is not a pass: without credentials it reports SKIPPED and, under
 * --strict, exits 1.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { HANDLED_STRIPE_EVENTS } from "../src/app/api/stripe/webhook/stripeWebhook.events";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const strict = process.argv.includes("--strict");

for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

const WEBHOOK_PATH = "/api/stripe/webhook";

type StripeEndpoint = {
  id: string;
  url: string;
  status: string;
  enabled_events: string[];
};

const errors: string[] = [];

function skip(reason: string): never {
  console.log("\n══ Stripe webhook subscription check ══\n");
  console.log(`⏭  SKIPPED — ${reason}`);
  console.log("   A skip is not a pass. Run this where the credentials live.\n");
  if (strict) {
    console.error("✖  --strict treats a skip as a failure.\n");
    process.exit(1);
  }
  process.exit(0);
}

/** A blip must not fail a gate people are meant to trust. */
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

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) skip("missing STRIPE_SECRET_KEY");

  const mode = stripeKey.startsWith("sk_live") || stripeKey.startsWith("rk_live") ? "live" : "test";

  const res = await fetchWithRetry("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`\n✖  Could not list webhook endpoints: ${body?.error?.message ?? res.status}\n`);
    process.exit(1);
  }

  const all = (body.data ?? []) as StripeEndpoint[];
  const ours = all.filter((e) => e.url.endsWith(WEBHOOK_PATH));
  let compared = 0;

  console.log(`\n══ Stripe webhook subscription check — ${mode.toUpperCase()} mode ══\n`);

  if (ours.length === 0) {
    if (mode === "live") {
      console.log(`   ✖ no endpoint whose URL ends in ${WEBHOOK_PATH}`);
      errors.push(
        `no webhook endpoint registered for ${WEBHOOK_PATH} — no payment, refund or subscription event ever reaches the app.`
      );
    } else {
      // Not an error in test mode, and deliberately so. Local development
      // forwards events with `stripe listen`, which creates no webhook_endpoint
      // object, so there is genuinely nothing to compare against. Failing here
      // would make this check red on every developer's machine for a correct
      // configuration — and a gate that cries wolf is one people stop reading,
      // which is how the missing charge.refunded subscription survived.
      console.log(`   ⏭ no registered test-mode endpoint`);
      console.log(`     Expected: local development forwards via \`stripe listen\`, which`);
      console.log(`     registers no endpoint. Run this against the live key to verify`);
      console.log(`     production:  railway run --service web -- npx tsx scripts/check-stripe-webhook.ts --strict`);
    }
  }

  for (const ep of ours) {
    console.log(`   ${ep.url}`);
    console.log(`   ${ep.id}  status=${ep.status}`);

    if (ep.status !== "enabled") {
      errors.push(`${ep.id} is status=${ep.status} — Stripe is not delivering to it.`);
    }

    // A wildcard subscription satisfies every handler, but it also delivers
    // everything else, and each of those falls to `default` and is dropped.
    // Not an error — just not something to verify event-by-event.
    if (ep.enabled_events.includes("*")) {
      console.log("   events: * (all)");
      console.log(
        "   ⚠ a wildcard delivers events with no handler too; those are answered 200 and dropped."
      );
      continue;
    }

    const subscribed = new Set(ep.enabled_events);
    const handled = new Set<string>(HANDLED_STRIPE_EVENTS);

    const notSubscribed = [...handled].filter((e) => !subscribed.has(e)).sort();
    const notHandled = [...subscribed].filter((e) => !handled.has(e)).sort();

    compared++;
    console.log(`   events: ${ep.enabled_events.length} subscribed, ${handled.size} handled in code\n`);

    for (const e of [...handled].sort()) {
      console.log(`     ${subscribed.has(e) ? "✔" : "✖"} ${e}`);
    }

    for (const e of notSubscribed) {
      errors.push(
        `${e}: handled in code but NOT subscribed — Stripe never sends it, so the handler is dead code.`
      );
    }
    for (const e of notHandled) {
      errors.push(
        `${e}: subscribed but NOT handled — it arrives, hits the switch's default, and is answered 200 and dropped.`
      );
    }
  }

  console.log("");
  if (errors.length > 0) {
    console.error(`❌  ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) console.error(`   • ${e}\n`);
    if (!strict) console.log("Reporting only — pass --strict to fail on these.\n");
  } else if (compared === 0) {
    // No endpoint was actually compared, so there is nothing to certify. Saying
    // "everything is subscribed" here would be the same lie the launch gate told
    // about STRIPE_SECRET_KEY: green because it never looked.
    console.log("⏭  Nothing compared — no endpoint to check in this mode.\n");
  } else {
    console.log("✔  Every handled event is subscribed, and nothing arrives without a handler.\n");
  }

  process.exit(strict && errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(
    `\n✖  check:stripe-webhook crashed: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
