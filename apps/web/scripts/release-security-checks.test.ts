import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HANDLED_STRIPE_EVENTS } from "../src/app/api/stripe/webhook/stripeWebhook.events";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const criticalChecks = [
  "check-billing-catalog.ts",
  "check-stripe-webhook.ts",
  "check-rls-paywall.ts",
] as const;
const releaseChecks = [...criticalChecks, "check-queue-consumers.ts"];
const credentials = {
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_URL: "https://supabase.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  STRIPE_SECRET_KEY: "sk_live_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  REDIS_URL: "redis://redis.invalid:6379",
  NEXT_PUBLIC_SITE_URL: "https://site.invalid",
};

function runCheck(
  script: string,
  scenario: Record<string, unknown> = {},
  strict = false,
  env: Record<string, string> = credentials
) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--import", resolve(scriptsDir, "release-security-checks.fixture.mjs"),
      resolve(scriptsDir, script), ...(strict ? ["--strict"] : [])],
    {
      cwd: resolve(scriptsDir, ".."),
      encoding: "utf8",
      timeout: 10_000,
      // Deliberate allowlist: never inherit developer/provider credentials.
      env: { PATH: process.env.PATH, NODE_ENV: "test", ...env,
        RELEASE_CHECK_SCENARIO: JSON.stringify(scenario) },
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { status: result.status, output: result.stdout + result.stderr };
}

const catalog = [
  { id: "author", role: "author", plan_key: "pro", interval: "month", price_id: "price_author",
    product_id: "product_fixture", is_active: true, livemode: true },
  { id: "reader", role: "reader", plan_key: "plus", interval: "month", price_id: "price_reader",
    product_id: "product_fixture", is_active: true, livemode: true },
];
const validPrice = {
  active: true, livemode: true, recurring: { interval: "month" },
  product: "product_fixture", currency: "sek", unit_amount: 4900,
};
const endpoint = {
  id: "we_fixture", url: "https://site.invalid/api/stripe/webhook", status: "enabled",
  enabled_events: [...HANDLED_STRIPE_EVENTS],
};

describe("release security check process exits", () => {
  for (const script of criticalChecks) {
    it.each([false, true])(`${script}: missing credentials skip only outside strict mode (%s)`, (strict) => {
      const result = runCheck(script, {}, strict, {});
      expect(result.output).toContain("SKIPPED");
      expect(result.output).not.toContain("[fixture request]");
      expect(result.status).toBe(strict ? 1 : 0);
    });
  }

  it.each([false, true])("billing catalog passes valid prices (strict=%s)", (strict) => {
    const result = runCheck("check-billing-catalog.ts", {
      catalog: { body: catalog }, price: { body: validPrice },
    }, strict);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Every active catalog row resolves");
  });

  it("billing catalog fails invalid prices without strict", () => {
    const result = runCheck("check-billing-catalog.ts", {
      catalog: { body: catalog }, price: { body: { ...validPrice, active: false } },
    });
    expect(result.output).toContain("price is archived");
    expect(result.status).toBe(1);
  });

  it("billing catalog crashes nonzero without strict", () => {
    const result = runCheck("check-billing-catalog.ts", { catalog: { raw: "invalid JSON" } });
    expect(result.output).toContain("crashed");
    expect(result.status).toBe(1);
  });

  it.each([false, true])("webhook passes complete subscriptions (strict=%s)", (strict) => {
    const result = runCheck("check-stripe-webhook.ts", { webhooks: { body: { data: [endpoint] } } }, strict);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Every handled event is subscribed");
  });

  it("webhook fails missing subscriptions without strict", () => {
    const result = runCheck("check-stripe-webhook.ts", {
      webhooks: { body: { data: [{ ...endpoint, enabled_events: [] }] } },
    });
    expect(result.output).toContain("NOT subscribed");
    expect(result.status).toBe(1);
  });

  it("webhook crashes nonzero without strict", () => {
    const result = runCheck("check-stripe-webhook.ts", { webhooks: { raw: "invalid JSON" } });
    expect(result.output).toContain("crashed");
    expect(result.status).toBe(1);
  });

  it.each([false, true])("webhook has no coverage without a test endpoint (strict=%s)", (strict) => {
    const result = runCheck("check-stripe-webhook.ts", { webhooks: { body: { data: [] } } }, strict,
      { ...credentials, STRIPE_SECRET_KEY: "sk_test_fixture" });
    expect(result.output).toContain("SKIPPED");
    expect(result.status).toBe(strict ? 1 : 0);
  });

  it("webhook accepts an enabled wildcard as subscription coverage", () => {
    const result = runCheck("check-stripe-webhook.ts", {
      webhooks: { body: { data: [{ ...endpoint, enabled_events: ["*"] }] } },
    }, true);
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("Nothing compared");
  });

  it.each([false, true])("paywall verifies an existing paid chapter is hidden (strict=%s)", (strict) => {
    const result = runCheck("check-rls-paywall.ts", {}, strict);
    expect(result.status).toBe(0);
    expect(result.output).toContain("[fixture request] service-chapters");
    expect(result.output).toContain("[fixture request] anon-chapters");
    expect(result.output).toContain("paywall intact");
  });

  it("paywall fails an anonymous chapter leak without strict", () => {
    const result = runCheck("check-rls-paywall.ts", { anonChapters: { body: [{ id: "paid-chapter" }] } });
    expect(result.output).toContain("anon read a chapter");
    expect(result.status).toBe(1);
  });

  it("paywall crashes nonzero without strict", () => {
    const result = runCheck("check-rls-paywall.ts", { inventory: { throw: "simulated network failure" } });
    expect(result.output).toContain("crashed");
    expect(result.status).toBe(1);
  });

  it.each(["inventory", "books", "serviceChapters", "anonChapters"])(
    "paywall fails HTTP errors in %s without strict", (probe) => {
      const result = runCheck("check-rls-paywall.ts", { [probe]: { status: 500, body: { message: "unavailable" } } });
      expect(result.status).toBe(1);
      expect(result.output).toContain("HTTP 500");
      expect(result.output).not.toContain("paywall intact");
    }
  );

  it.each(["books", "serviceChapters"])("paywall reports missing %s coverage explicitly", (probe) => {
    for (const strict of [false, true]) {
      const result = runCheck("check-rls-paywall.ts", { [probe]: { body: [] } }, strict);
      expect(result.status).toBe(strict ? 1 : 0);
      expect(result.output).toContain("SKIPPED");
      expect(result.output).not.toContain("paywall intact");
      expect(result.output).not.toContain("[fixture request] anon-chapters");
    }
  });

  it("paywall does not hide a shape failure behind absent paid-book coverage", () => {
    const result = runCheck("check-rls-paywall.ts", { inventory: { body: [] }, books: { body: [] } });
    expect(result.output).toContain("NO permissive SELECT policy");
    expect(result.status).toBe(1);
  });

  it.each([401, 403])("paywall accepts a verified chapter permission denial (HTTP %s)", (status) => {
    const result = runCheck("check-rls-paywall.ts", {
      anonChapters: { status, body: { code: "42501", message: "permission denied for table chapters" } },
    }, true);
    expect(result.status).toBe(0);
    expect(result.output).toContain("[fixture request] anon-books");
    expect(result.output).toContain("paywall intact");
  });

  it.each([{ status: 401, body: { message: "Invalid API key" } }, { body: [] }])(
    "paywall rejects a permission denial without a readable anonymous control (%j)", (anonBooks) => {
      const result = runCheck("check-rls-paywall.ts", {
        anonChapters: { status: 403, body: { code: "42501", message: "permission denied for table chapters" } },
        anonBooks,
      });
      expect(result.status).toBe(1);
      expect(result.output).not.toContain("paywall intact");
    }
  );

  it("paywall fails a missing policy inventory RPC without strict", () => {
    const result = runCheck("check-rls-paywall.ts", { inventory: { status: 404, body: { code: "PGRST202" } } });
    expect(result.status).toBe(1);
    expect(result.output).toContain("policy_inventory");
  });

  it.each([401, 403])("paywall rejects unrelated authorization failures (HTTP %s)", (status) => {
    const result = runCheck("check-rls-paywall.ts", {
      anonChapters: { status, body: { message: "Invalid API key" } },
    });
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("paywall intact");
  });

  it("paywall rejects a malformed successful anon response", () => {
    const result = runCheck("check-rls-paywall.ts", { anonChapters: { body: { error: "unexpected response" } } });
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("paywall intact");
  });
});

describe("qa-beta release orchestration (all external work mocked)", () => {
  it("forwards strict to every critical release check", () => {
    const result = runCheck("qa-beta.mjs");
    expect(result.status).toBe(0);
    for (const script of releaseChecks) {
      expect(result.output).toContain(`[fixture command] npx tsx scripts/${script} --strict`);
    }
    expect(result.output).toContain("ALL PASSED");
  });

  it.each(releaseChecks)("does not report ALL PASSED when %s skips", (script) => {
    const result = runCheck("qa-beta.mjs", { qaSkip: script });
    expect(result.output).toContain("SKIPPED");
    expect(result.output).not.toContain("ALL PASSED");
    expect(result.output).not.toContain("[fixture command] npx next build");
    expect(result.status).toBe(1);
  });
});


describe("closed-beta queue consumer requirements", () => {
  it("accepts an empty social queue without a worker while delivery is blocked", () => {
    const result = runCheck("check-queue-consumers.ts", {
      queues: { "social-publish": { workers: 0 } },
    }, true);
    expect(result.status).toBe(0);
    expect(result.output).toContain("social delivery blocked by closed-beta policy");
  });

  it.each([0, 1])("still flags pending social jobs with %s workers", (workers) => {
    const result = runCheck("check-queue-consumers.ts", {
      queues: { "social-publish": { workers, pending: 1 } },
    }, true);
    expect(result.status).toBe(1);
    expect(result.output).toContain("pending while social delivery is blocked");
  });

  it("still requires the marketing campaign worker", () => {
    const result = runCheck("check-queue-consumers.ts", {
      queues: { "marketing-campaign": { workers: 0 } },
    }, true);
    expect(result.status).toBe(1);
    expect(result.output).toContain("marketing-campaign: NO WORKER");
  });
});
