# Usage Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mäta vad varje användare faktiskt kostar i AI-anrop, storage, egress och
jobb, så att abonnemangs- och creditpriser kan sättas på data efter betan.

**Architecture:** En mätarmodul (`src/lib/usage/`) skriver en rad per mätbar
händelse till `usage_events` med *rå enhet* bevarad. Varje providerfunktion tar ett
valfritt `meter?: MeterContext` — saknas det mäts ingenting, så inga befintliga
anropssignaturer bryts. Prissättning sker via en versionerad `usage_price_book`;
saknas pris sparas kvantiteten ändå och raden flaggas som oprissatt. En nattlig
cron rullar ihop till `usage_daily`, som admin-UI läser.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role-klient), vitest, tsx-scripts, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-22-usage-metering-design.md`

## Global Constraints

- Mätaren får **aldrig** fälla anroparen. All skrivning är fire-and-forget; fel går till `console.error` + Sentry, aldrig till användaren.
- Rå enhet sparas alltid (`quantity` + `unit`). `cost_usd` får vara `NULL`.
- Alla tre tabeller är **service-role only**. Ingen policy för `anon` eller `authenticated`.
- Alla DB-anrop går via `createAdminClient()` från `@/lib/supabase/admin` (typad med `Database`).
- Migrationsnamn: `supabase/migrations/YYYYMMDDHHMMSS_<namn>.sql`. Kör `db push` **endast från `apps/web`** — från repo-roten finns en decoy `supabase/migrations/` som får CLI:t att rapportera total drift.
- Efter varje task: `npx tsc --noEmit` från `apps/web`. `npm run build` typkollar **inte** testfiler.
- Kör tester från `apps/web`, aldrig från repo-roten (roten samlar in fem inaktuella `.claude/worktrees`-kopior → ~1246 falska fel).
- Inga hårda tak, ingen credit-avdragning. Befintliga Redis-budgetar i `src/lib/workers/budget.ts` rörs inte.

---

### Task 1: Schema — tre tabeller + prisbok

**Files:**
- Create: `apps/web/supabase/migrations/20260922100000_usage_metering.sql`
- Modify: `apps/web/src/lib/supabase/types.ts` (regenereras)

**Interfaces:**
- Produces: tabellerna `usage_events`, `usage_daily`, `usage_price_book`; typerna `Database["public"]["Tables"]["usage_events"]` m.fl.

- [ ] **Step 1: Skriv migrationen**

```sql
-- Usage metering for the beta. Measures cost, never enforces it.
--
-- Raw units are stored alongside cost on purpose: provider prices change, and a
-- row holding only `cost_usd` cannot be repriced. A row holding
-- `quantity=41203, unit='input_tokens'` can be repriced forever.
--
-- Service-role only. Per-user spend is commercially sensitive and these tables
-- carry no user-facing feature, so there is no reason for `anon` or
-- `authenticated` to hold any policy here at all.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('ai_call','storage_snapshot','egress_grant','job')),
  provider      text,
  model         text,
  pipeline      text,
  quantity      bigint NOT NULL DEFAULT 0,
  unit          text NOT NULL,
  cost_usd      numeric(12,6),
  price_version text,
  book_id       uuid REFERENCES public.books(id) ON DELETE SET NULL,
  job_id        uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  request_id    text,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS usage_events_user_time_idx
  ON public.usage_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_time_idx
  ON public.usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_pipeline_idx
  ON public.usage_events (pipeline, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.usage_daily (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day           date NOT NULL,
  pipeline      text NOT NULL DEFAULT '',
  provider      text NOT NULL DEFAULT '',
  unit          text NOT NULL,
  quantity_sum  bigint NOT NULL DEFAULT 0,
  cost_usd_sum  numeric(12,6) NOT NULL DEFAULT 0,
  event_count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, pipeline, provider, unit)
);

CREATE INDEX IF NOT EXISTS usage_daily_day_idx ON public.usage_daily (day DESC);

CREATE TABLE IF NOT EXISTS public.usage_price_book (
  version        text NOT NULL,
  provider       text NOT NULL,
  model          text NOT NULL,
  unit           text NOT NULL,
  usd_per_unit   numeric(16,10) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  PRIMARY KEY (version, provider, model, unit)
);

ALTER TABLE public.usage_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_price_book ENABLE ROW LEVEL SECURITY;

-- RLS enabled with zero policies = deny for anon and authenticated.
-- The service role bypasses RLS, which is the only access path we want.
-- Column privileges are revoked too: RLS scopes the row, never the field, and
-- `profiles.role` shipped readable to clients for exactly this reason.
REVOKE ALL ON public.usage_events     FROM anon, authenticated;
REVOKE ALL ON public.usage_daily      FROM anon, authenticated;
REVOKE ALL ON public.usage_price_book FROM anon, authenticated;
```

- [ ] **Step 2: Applicera mot live-DB**

```bash
cd apps/web && npm run db:push
```

Kör **bara** härifrån. Från repo-roten får CLI:t en decoy-migrationskatalog och föreslår att återställa 95 applicerade migrationer — gör aldrig det.

- [ ] **Step 3: Verifiera att tabellerna finns på riktigt**

En grön `migration list` bevisar att liggaren är överens, inte att schemat ändrats — `20260312130000` registrerades en gång med `repair --status applied` utan att någonsin ha körts, och det fick paywallen att neka varje betalande läsare. Verifiera därför direkt:

```bash
cd apps/web && npx tsx -e "
import { createAdminClient } from './src/lib/supabase/admin';
const a = createAdminClient();
for (const t of ['usage_events','usage_daily','usage_price_book']) {
  const { error, count } = await a.from(t).select('*', { count: 'exact', head: true });
  console.log(t, error ? 'SAKNAS: ' + error.message : 'OK (' + count + ' rader)');
}
"
```

Förväntat: tre rader `OK (0 rader)`.

- [ ] **Step 4: Regenerera typer**

```bash
cd apps/web && npm run generate:types && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20260922100000_usage_metering.sql apps/web/src/lib/supabase/types.ts
git commit -m "feat(usage): add usage_events, usage_daily and usage_price_book

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 2: Typer + prisbok

**Files:**
- Create: `apps/web/src/lib/usage/types.ts`
- Create: `apps/web/src/lib/usage/price-book.ts`
- Test: `apps/web/src/lib/usage/price-book.test.ts`

**Interfaces:**
- Produces:
  - `type Pipeline = "tts" | "translation" | "video" | "editorial" | "cover" | "assistant" | "import"`
  - `type UsageUnit = "input_tokens" | "output_tokens" | "chars" | "renders" | "bytes" | "ms"`
  - `type MeterContext = { userId: string; pipeline: Pipeline; bookId?: string | null; jobId?: string | null }`
  - `type UsageEventInput = { kind; provider?; model?; quantity; unit; requestId?; meta? }`
  - `priceFor(rows: PriceRow[], provider: string, model: string, unit: UsageUnit, at: Date): PriceRow | null`
  - `computeCost(row: PriceRow | null, quantity: number): { costUsd: number | null; priceVersion: string | null }`

- [ ] **Step 1: Skriv typerna**

```ts
// apps/web/src/lib/usage/types.ts

/** Which product surface spent the money. */
export type Pipeline =
  | "tts"
  | "translation"
  | "video"
  | "editorial"
  | "cover"
  | "assistant"
  | "import";

/**
 * The raw billable unit. Never collapse input and output tokens into one
 * "tokens" figure: they carry different prices, so a merged number cannot be
 * repriced when a provider changes its list.
 */
export type UsageUnit =
  | "input_tokens"
  | "output_tokens"
  | "chars"
  | "renders"
  | "bytes"
  | "ms";

export type UsageKind = "ai_call" | "storage_snapshot" | "egress_grant" | "job";

/**
 * Passed into a provider call to say who to bill. Optional everywhere: when a
 * script, a seed or a test calls a provider without one, nothing is measured
 * and no signature breaks.
 */
export type MeterContext = {
  userId: string;
  pipeline: Pipeline;
  bookId?: string | null;
  jobId?: string | null;
};

export type UsageEventInput = {
  kind: UsageKind;
  provider?: string | null;
  model?: string | null;
  quantity: number;
  unit: UsageUnit;
  requestId?: string | null;
  meta?: Record<string, unknown>;
};

export type PriceRow = {
  version: string;
  provider: string;
  model: string;
  unit: string;
  usd_per_unit: number;
  effective_from: string;
  effective_to: string | null;
};
```

- [ ] **Step 2: Skriv det fallerande testet**

```ts
// apps/web/src/lib/usage/price-book.test.ts
import { describe, it, expect } from "vitest";
import { priceFor, computeCost } from "./price-book";
import type { PriceRow } from "./types";

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  version: "2026-09",
  provider: "openai",
  model: "gpt-6-astra",
  unit: "input_tokens",
  usd_per_unit: 0.0000025,
  effective_from: "2026-09-01T00:00:00Z",
  effective_to: null,
  ...over,
});

describe("priceFor", () => {
  it("finds the row matching provider, model and unit", () => {
    const found = priceFor([row()], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"));
    expect(found?.version).toBe("2026-09");
  });

  it("returns null when no row matches the model", () => {
    const found = priceFor([row()], "openai", "some-other-model", "input_tokens", new Date("2026-09-22"));
    expect(found).toBeNull();
  });

  it("ignores rows that expired before the event", () => {
    const expired = row({ effective_to: "2026-09-10T00:00:00Z" });
    expect(priceFor([expired], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"))).toBeNull();
  });

  it("ignores rows that start after the event", () => {
    const future = row({ effective_from: "2026-10-01T00:00:00Z" });
    expect(priceFor([future], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"))).toBeNull();
  });

  it("picks the newest applicable row when versions overlap", () => {
    const older = row({ version: "2026-08", effective_from: "2026-08-01T00:00:00Z", usd_per_unit: 0.000005 });
    const newer = row({ version: "2026-09", effective_from: "2026-09-01T00:00:00Z", usd_per_unit: 0.0000025 });
    const found = priceFor([older, newer], "openai", "gpt-6-astra", "input_tokens", new Date("2026-09-22"));
    expect(found?.version).toBe("2026-09");
  });
});

describe("computeCost", () => {
  it("multiplies quantity by the unit price", () => {
    expect(computeCost(row(), 40_000)).toEqual({ costUsd: 0.1, priceVersion: "2026-09" });
  });

  it("returns a null cost when the unit is unpriced, so quantity is still kept", () => {
    expect(computeCost(null, 40_000)).toEqual({ costUsd: null, priceVersion: null });
  });

  it("does not lose sub-cent precision", () => {
    const { costUsd } = computeCost(row({ usd_per_unit: 0.0000001 }), 3);
    expect(costUsd).toBeCloseTo(0.0000003, 10);
  });
});
```

- [ ] **Step 3: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/price-book.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./price-book"`.

- [ ] **Step 4: Implementera**

```ts
// apps/web/src/lib/usage/price-book.ts
import type { PriceRow, UsageUnit } from "./types";

/**
 * The applicable price row for one measurement, or null.
 *
 * Null is a normal outcome, not an error: a model can be called before anyone
 * has entered its price. The event is still written with its raw quantity and
 * flagged unpriced, so the gap is visible in admin rather than looking like
 * zero spend.
 */
export function priceFor(
  rows: PriceRow[],
  provider: string,
  model: string,
  unit: UsageUnit,
  at: Date
): PriceRow | null {
  const ms = at.getTime();
  const applicable = rows.filter(
    (r) =>
      r.provider === provider &&
      r.model === model &&
      r.unit === unit &&
      new Date(r.effective_from).getTime() <= ms &&
      (r.effective_to === null || new Date(r.effective_to).getTime() > ms)
  );
  if (applicable.length === 0) return null;
  // Newest start wins, so a mid-period price change takes effect without
  // anyone having to close the previous row.
  return applicable.reduce((best, r) =>
    new Date(r.effective_from).getTime() > new Date(best.effective_from).getTime() ? r : best
  );
}

export function computeCost(
  row: PriceRow | null,
  quantity: number
): { costUsd: number | null; priceVersion: string | null } {
  if (!row) return { costUsd: null, priceVersion: null };
  return { costUsd: row.usd_per_unit * quantity, priceVersion: row.version };
}
```

- [ ] **Step 5: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/usage/price-book.test.ts && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/usage/
git commit -m "feat(usage): versioned price book with unpriced-unit fallback

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 3: Mätarmodulen

**Files:**
- Create: `apps/web/src/lib/usage/meter.ts`
- Test: `apps/web/src/lib/usage/meter.test.ts`

**Interfaces:**
- Consumes: `MeterContext`, `UsageEventInput`, `priceFor`, `computeCost` (Task 2)
- Produces: `recordUsage(ctx: MeterContext | undefined, events: UsageEventInput[]): Promise<void>` — resolvar alltid, kastar aldrig.

- [ ] **Step 1: Skriv det fallerande testet**

```ts
// apps/web/src/lib/usage/meter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const priceSelectMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "usage_price_book"
        ? { select: priceSelectMock }
        : { insert: insertMock },
  }),
}));

const { recordUsage } = await import("./meter");

const ctx = { userId: "user-1", pipeline: "editorial" as const, bookId: "book-1" };

describe("recordUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    priceSelectMock.mockResolvedValue({
      data: [
        {
          version: "2026-09",
          provider: "openai",
          model: "gpt-6-astra",
          unit: "input_tokens",
          usd_per_unit: 0.0000025,
          effective_from: "2026-09-01T00:00:00Z",
          effective_to: null,
        },
      ],
      error: null,
    });
    insertMock.mockResolvedValue({ error: null });
  });

  it("writes one row per event with the raw quantity and the priced cost", async () => {
    await recordUsage(ctx, [
      { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 40_000, unit: "input_tokens" },
    ]);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [rows] = insertMock.mock.calls[0];
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      pipeline: "editorial",
      book_id: "book-1",
      quantity: 40_000,
      unit: "input_tokens",
      cost_usd: 0.1,
      price_version: "2026-09",
    });
  });

  it("still records the quantity when the unit has no price", async () => {
    await recordUsage(ctx, [
      { kind: "ai_call", provider: "elevenlabs", model: "eleven_multilingual_v2", quantity: 8_120, unit: "chars" },
    ]);
    const [rows] = insertMock.mock.calls[0];
    expect(rows[0].quantity).toBe(8_120);
    expect(rows[0].cost_usd).toBeNull();
    expect(rows[0].meta.price_missing).toBe(true);
  });

  it("does nothing at all when there is no meter context", async () => {
    await recordUsage(undefined, [
      { kind: "ai_call", provider: "openai", quantity: 1, unit: "input_tokens" },
    ]);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("never throws when the insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      recordUsage(ctx, [{ kind: "ai_call", quantity: 1, unit: "input_tokens" }])
    ).resolves.toBeUndefined();
  });

  it("never throws when the database is unreachable", async () => {
    insertMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      recordUsage(ctx, [{ kind: "ai_call", quantity: 1, unit: "input_tokens" }])
    ).resolves.toBeUndefined();
  });

  it("skips zero-quantity events so empty replies do not create noise", async () => {
    await recordUsage(ctx, [{ kind: "ai_call", quantity: 0, unit: "input_tokens" }]);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/meter.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./meter"`.

- [ ] **Step 3: Implementera**

```ts
// apps/web/src/lib/usage/meter.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { priceFor, computeCost } from "./price-book";
import type { MeterContext, PriceRow, UsageEventInput } from "./types";

/**
 * Writes usage rows. Measures cost; never enforces it.
 *
 * This function is fire-and-forget by contract: it resolves even when the
 * database is gone. A broken meter must degrade to missing data, never to a
 * failed audiobook — the caller has already spent the money by the time we are
 * asked to record it, so throwing here would lose the work AND the record.
 */
export async function recordUsage(
  ctx: MeterContext | undefined,
  events: UsageEventInput[]
): Promise<void> {
  if (!ctx) return;
  const billable = events.filter((e) => e.quantity > 0);
  if (billable.length === 0) return;

  try {
    const admin = createAdminClient();
    const { data: priceRows } = await admin
      .from("usage_price_book")
      .select("version, provider, model, unit, usd_per_unit, effective_from, effective_to");
    const prices = (priceRows ?? []) as PriceRow[];
    const now = new Date();

    const rows = billable.map((event) => {
      const price = event.provider && event.model
        ? priceFor(prices, event.provider, event.model, event.unit, now)
        : null;
      const { costUsd, priceVersion } = computeCost(price, event.quantity);
      return {
        user_id: ctx.userId,
        occurred_at: now.toISOString(),
        kind: event.kind,
        provider: event.provider ?? null,
        model: event.model ?? null,
        pipeline: ctx.pipeline,
        quantity: event.quantity,
        unit: event.unit,
        cost_usd: costUsd,
        price_version: priceVersion,
        book_id: ctx.bookId ?? null,
        job_id: ctx.jobId ?? null,
        request_id: event.requestId ?? null,
        meta: { ...(event.meta ?? {}), ...(costUsd === null ? { price_missing: true } : {}) },
      };
    });

    const { error } = await admin.from("usage_events").insert(rows);
    if (error) console.error("[usage] insert failed", { message: error.message });
  } catch (err) {
    console.error("[usage] record failed", err);
  }
}
```

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/usage/meter.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/usage/meter.ts apps/web/src/lib/usage/meter.test.ts
git commit -m "feat(usage): fire-and-forget usage recorder

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 4: OpenAI-mätning

**Files:**
- Modify: `apps/web/src/lib/ai/providers/openai.ts`
- Test: `apps/web/src/lib/ai/providers/openai.test.ts`

**Interfaces:**
- Consumes: `recordUsage`, `MeterContext`
- Produces: `OpenAiCallInput` får fältet `meter?: MeterContext`. Returtypen förblir `Promise<string>` — inget anropsställe bryts.

- [ ] **Step 1: Lägg till det fallerande testet**

Lägg till i `openai.test.ts`:

```ts
import { vi } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({ recordUsage: (...a: unknown[]) => recordUsageMock(...a) }));

it("records input and output tokens as two separate events", async () => {
  recordUsageMock.mockClear();
  // `ok` is the existing helper in this file that builds a Responses payload.
  fetchMock.mockResolvedValue(
    ok({ output_text: "hi", usage: { input_tokens: 1200, output_tokens: 340 } })
  );
  await callOpenAi({
    system: "s",
    user: "u",
    maxTokens: 100,
    meter: { userId: "user-1", pipeline: "editorial" },
  });
  const [ctx, events] = recordUsageMock.mock.calls[0];
  expect(ctx.userId).toBe("user-1");
  expect(events).toEqual([
    { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 1200, unit: "input_tokens" },
    { kind: "ai_call", provider: "openai", model: "gpt-6-astra", quantity: 340, unit: "output_tokens" },
  ]);
});

it("records nothing when no meter context is supplied", async () => {
  recordUsageMock.mockClear();
  fetchMock.mockResolvedValue(ok({ output_text: "hi", usage: { input_tokens: 5, output_tokens: 5 } }));
  await callOpenAi({ system: "s", user: "u", maxTokens: 100 });
  expect(recordUsageMock).not.toHaveBeenCalled();
});

it("flags a reply that carries no usage block instead of recording silent zeros", async () => {
  recordUsageMock.mockClear();
  fetchMock.mockResolvedValue(ok({ output_text: "hi" }));
  await callOpenAi({
    system: "s",
    user: "u",
    maxTokens: 100,
    meter: { userId: "user-1", pipeline: "editorial" },
  });
  const [, events] = recordUsageMock.mock.calls[0];
  expect(events[0].meta.usage_missing).toBe(true);
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/ai/providers/openai.test.ts
```

Förväntat: FAIL — `recordUsageMock` anropas aldrig.

- [ ] **Step 3: Implementera**

I `openai.ts`, lägg till importer och utöka `ResponsesPayload` och `OpenAiCallInput`:

```ts
import { recordUsage } from "@/lib/usage/meter";
import type { MeterContext } from "@/lib/usage/types";

type ResponsesPayload = {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type OpenAiCallInput = {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  schema?: OpenAiJsonSchema;
  /** When present, token spend is billed to this user. Absent = not measured. */
  meter?: MeterContext;
};
```

Precis före `return text;` i `callOpenAi`:

```ts
  // Measured after the reply is known good, and never awaited in a way that can
  // fail the call: the tokens are already spent, so a metering problem must not
  // also cost the caller their result.
  //
  // A reply with no `usage` block gets a zero-quantity pair (which `recordUsage`
  // drops) plus one explicit marker row. Without the marker the gap would look
  // identical to a user who simply spent nothing, and a silent hole in cost data
  // is the one failure that survives all the way into a wrong price.
  const usage = payload.usage;
  if (usage) {
    await recordUsage(input.meter, [
      { kind: "ai_call", provider: "openai", model,
        quantity: usage.input_tokens ?? 0, unit: "input_tokens" },
      { kind: "ai_call", provider: "openai", model,
        quantity: usage.output_tokens ?? 0, unit: "output_tokens" },
    ]);
  } else {
    await recordUsage(input.meter, [
      { kind: "ai_call", provider: "openai", model, quantity: 1, unit: "ms",
        meta: { usage_missing: true, note: "provider returned no usage block" } },
    ]);
  }
  return text;
```

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/ai/providers/openai.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/providers/openai.ts apps/web/src/lib/ai/providers/openai.test.ts
git commit -m "feat(usage): meter OpenAI token spend

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 5: Anthropic-mätning

**Files:**
- Modify: `apps/web/src/lib/ai/providers/anthropic-translator.ts`
- Test: `apps/web/src/lib/ai/providers/anthropic-translator.test.ts`

**Interfaces:**
- Consumes: `recordUsage`, `MeterContext`
- Produces: `TranslateOptions` och `translateBatch` får ett valfritt `meter?: MeterContext`.

Anthropic-anropet går via den officiella SDK:n (`client.messages.create`), så `response.usage` finns direkt på svaret — ingen parsning behövs.

- [ ] **Step 1: Skriv det fallerande testet**

```ts
it("records Anthropic input and output tokens", async () => {
  recordUsageMock.mockClear();
  messagesCreateMock.mockResolvedValue({
    content: [{ type: "text", text: '["hej"]' }],
    usage: { input_tokens: 900, output_tokens: 120 },
  });
  await new AnthropicTranslator().translateBatch(
    ["hi"], "en", "sv",
    { userId: "user-1", pipeline: "translation" }
  );
  const [ctx, events] = recordUsageMock.mock.calls[0];
  expect(ctx.pipeline).toBe("translation");
  expect(events).toEqual([
    { kind: "ai_call", provider: "anthropic", model: MODEL_ID, quantity: 900, unit: "input_tokens" },
    { kind: "ai_call", provider: "anthropic", model: MODEL_ID, quantity: 120, unit: "output_tokens" },
  ]);
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/ai/providers/anthropic-translator.test.ts
```

Förväntat: FAIL — `translateBatch` tar inte fyra argument.

- [ ] **Step 3: Implementera**

I `translateChunk`, efter `const response = await client.messages.create({...})`:

```ts
  await recordUsage(meter, [
    { kind: "ai_call", provider: "anthropic", model: MODEL_ID,
      quantity: response.usage?.input_tokens ?? 0, unit: "input_tokens" },
    { kind: "ai_call", provider: "anthropic", model: MODEL_ID,
      quantity: response.usage?.output_tokens ?? 0, unit: "output_tokens" },
  ]);
```

Trä `meter?: MeterContext` genom `translateChunk`, `translateBatch` och `translate` som sista, valfria parameter.

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/ai/providers/anthropic-translator.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/providers/anthropic-translator.ts apps/web/src/lib/ai/providers/anthropic-translator.test.ts
git commit -m "feat(usage): meter Anthropic translation token spend

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 6: ElevenLabs-mätning

**Files:**
- Modify: `apps/web/src/lib/tts/elevenlabs-tts-provider.ts`
- Modify: `apps/web/src/lib/tts/tts-provider.ts` (lägg `meter?` på `TtsSynthesisOptions`)
- Test: `apps/web/src/lib/tts/elevenlabs-tts-provider.test.ts`

**Interfaces:**
- Produces: `TtsSynthesisOptions` får `meter?: MeterContext`.

ElevenLabs fakturerar på **inskickade tecken**, så indata är den auktoritativa enheten. `inputLength` finns redan i `metadata` — ingen gissning behövs ur svaret.

- [ ] **Step 1: Skriv det fallerande testet**

```ts
it("records characters sent, which is what ElevenLabs bills", async () => {
  recordUsageMock.mockClear();
  fetchMock.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(128),
  });
  const text = "a".repeat(8_120);
  await new ElevenLabsTtsProvider().synthesize(text, {
    voiceId: "voice-1", modelId: "eleven_multilingual_v2", timeoutMs: 1_000,
    meter: { userId: "user-1", pipeline: "tts", bookId: "book-1" },
  });
  const [ctx, events] = recordUsageMock.mock.calls[0];
  expect(ctx.bookId).toBe("book-1");
  expect(events).toEqual([
    { kind: "ai_call", provider: "elevenlabs", model: "eleven_multilingual_v2",
      quantity: 8_120, unit: "chars" },
  ]);
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/tts/elevenlabs-tts-provider.test.ts
```

Förväntat: FAIL — `recordUsageMock` anropas aldrig.

- [ ] **Step 3: Implementera**

I `synthesize`, precis före `return { wav: ... }`:

```ts
      await recordUsage(options.meter, [
        { kind: "ai_call", provider: "elevenlabs", model: modelId,
          quantity: text.length, unit: "chars" },
      ]);
```

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/tts/elevenlabs-tts-provider.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tts/
git commit -m "feat(usage): meter ElevenLabs character spend

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 7: fal.ai-mätning

**Files:**
- Modify: `apps/web/src/lib/fal-image.ts`
- Test: `apps/web/src/lib/fal-image.budget.test.ts`

**Interfaces:**
- Produces: `GenerateCoverImagesInput` får `meter?: MeterContext`.

- [ ] **Step 1: Skriv det fallerande testet**

```ts
it("records one render per generated image, tagged with the fal request id", async () => {
  recordUsageMock.mockClear();
  const { requestId } = await generateCoverImages({
    prompt: "a lighthouse",
    meter: { userId: "user-1", pipeline: "cover", bookId: "book-1" },
  });
  const [, events] = recordUsageMock.mock.calls[0];
  expect(events[0]).toMatchObject({
    kind: "ai_call", provider: "fal", unit: "renders", quantity: COVER_COUNT, requestId,
  });
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/fal-image.budget.test.ts
```

Förväntat: FAIL — `recordUsageMock` anropas aldrig.

- [ ] **Step 3: Implementera**

Precis före `return { requestId, imageUrls };`:

```ts
  // `requestId` travels with the row so a line on fal's invoice can be matched
  // back to the author who triggered it.
  await recordUsage(meter, [
    { kind: "ai_call", provider: "fal", model: FAL_MODEL_ID,
      quantity: COVER_COUNT, unit: "renders", requestId },
  ]);
```

Om `FAL_MODEL_ID` inte redan finns som konstant i filen, härled den från `FAL_ENDPOINT` och exportera den.

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/fal-image.budget.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/fal-image.ts apps/web/src/lib/fal-image.budget.test.ts
git commit -m "feat(usage): meter fal.ai cover renders

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 8: Koppla in meter-kontext på anropsställena

Providrarna kan nu mäta, men ingen skickar in en kontext ännu. Detta är den task som faktiskt tänder mätaren.

**Files:**
- Modify: `apps/web/src/lib/editorial/provider.ts`
- Modify: `apps/web/src/lib/marketing/critique.ts`
- Modify: `apps/web/src/lib/marketing/launch-copy-provider.ts`
- Modify: `apps/web/src/lib/ai/writing-assistant.ts`
- Modify: `apps/web/scripts/audiobook-worker.ts`
- Modify: `apps/web/scripts/translation-worker.ts`
- Modify: `apps/web/scripts/marketing-worker.ts`
- Modify: `apps/web/src/app/api/books/[id]/cover/generate/route.ts`

**Interfaces:**
- Consumes: `MeterContext` (Task 2) och de `meter?`-fält som Task 4–7 lade till.

- [ ] **Step 1: Kartlägg varje anropsställe**

```bash
cd apps/web && grep -rn "callOpenAi(\|translateBatch(\|\.synthesize(\|generateCoverImages(" src scripts --include="*.ts" | grep -v "\.test\."
```

Varje träff behöver en `meter: { userId, pipeline, bookId, jobId }`. `userId` och `bookId` finns redan i scope på alla ställen — workers har dem från `ai_jobs`-raden, routes från sessionen.

- [ ] **Step 2: Skriv ett integrationstest per pipeline**

```ts
// apps/web/src/lib/usage/wiring.test.ts
import { describe, it, expect, vi } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("@/lib/usage/meter", () => ({ recordUsage: (...a: unknown[]) => recordUsageMock(...a) }));

describe("meter wiring", () => {
  it("editorial review bills the requesting author", async () => {
    recordUsageMock.mockClear();
    const { generateEditorialReview } = await import("@/lib/editorial/provider");
    await generateEditorialReview({
      text: "en mening",
      userId: "user-1",
      bookId: "book-1",
    } as never);
    expect(recordUsageMock).toHaveBeenCalled();
    const [ctx] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "editorial", bookId: "book-1" });
  });
});
```

Upprepa samma form för `tts`, `translation`, `cover` och `assistant`.

- [ ] **Step 3: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/wiring.test.ts
```

Förväntat: FAIL — `recordUsage` anropas inte.

- [ ] **Step 4: Trä igenom kontexten**

Lägg till `meter: { userId, pipeline: "<pipeline>", bookId, jobId }` på varje anropsställe från Step 1.

- [ ] **Step 5: Kör hela sviten**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint
```

Hela sviten, inte bara de nya filerna: den här tasken ändrar signaturer som befintliga tester anropar.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src apps/web/scripts
git commit -m "feat(usage): bill AI spend to the user who triggered it

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 9: Jobb- och aktivitetsmått

**Files:**
- Create: `apps/web/src/lib/usage/record-job.ts`
- Test: `apps/web/src/lib/usage/record-job.test.ts`
- Modify: de ställen som sätter `ai_jobs.status` till `done` eller `failed`

**Interfaces:**
- Produces: `recordJobCompletion(job: { id; user_id; kind; book_id; started_at; finished_at; status }): Promise<void>`

- [ ] **Step 1: Hitta var jobb avslutas**

```bash
cd apps/web && grep -rn "status: \"done\"\|status: \"failed\"\|status: 'done'" src scripts --include="*.ts" | grep -v "\.test\."
```

- [ ] **Step 2: Skriv det fallerande testet**

```ts
// apps/web/src/lib/usage/record-job.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("./meter", () => ({ recordUsage: (...a: unknown[]) => recordUsageMock(...a) }));

const { recordJobCompletion } = await import("./record-job");

describe("recordJobCompletion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records wall-clock duration in milliseconds", async () => {
    await recordJobCompletion({
      id: "job-1", user_id: "user-1", kind: "audiobook_generation", book_id: "book-1",
      started_at: "2026-09-22T10:00:00Z", finished_at: "2026-09-22T10:02:30Z", status: "done",
    });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx).toMatchObject({ userId: "user-1", pipeline: "tts", jobId: "job-1" });
    expect(events[0]).toMatchObject({ kind: "job", quantity: 150_000, unit: "ms" });
    expect(events[0].meta).toMatchObject({ job_kind: "audiobook_generation", status: "done" });
  });

  it("records a failed job too, since failures still cost money", async () => {
    await recordJobCompletion({
      id: "job-2", user_id: "user-1", kind: "translation", book_id: null,
      started_at: "2026-09-22T10:00:00Z", finished_at: "2026-09-22T10:00:05Z", status: "failed",
    });
    const [, events] = recordUsageMock.mock.calls[0];
    expect(events[0].meta.status).toBe("failed");
  });

  it("skips a job that never started rather than recording a negative duration", async () => {
    await recordJobCompletion({
      id: "job-3", user_id: "user-1", kind: "translation", book_id: null,
      started_at: null, finished_at: "2026-09-22T10:00:05Z", status: "done",
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/record-job.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./record-job"`.

- [ ] **Step 4: Implementera**

```ts
// apps/web/src/lib/usage/record-job.ts
import { recordUsage } from "./meter";
import type { Pipeline } from "./types";

/**
 * `ai_jobs.kind` is the long form: `audiobook_generation`, not `audiobook`.
 * Querying the short name returns zero rows and reads as "no job ever ran".
 */
const JOB_KIND_TO_PIPELINE: Record<string, Pipeline> = {
  audiobook_generation: "tts",
  translation: "translation",
  book_import: "import",
  cover_generation: "cover",
  editorial_review: "editorial",
  trailer_generation: "video",
};

export async function recordJobCompletion(job: {
  id: string;
  user_id: string;
  kind: string;
  book_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: string;
}): Promise<void> {
  if (!job.started_at || !job.finished_at) return;
  const durationMs = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;

  const pipeline = JOB_KIND_TO_PIPELINE[job.kind];
  if (!pipeline) return;

  // Failed jobs are recorded too: a run that burned tokens and then crashed is
  // exactly the cost we would otherwise price at zero.
  await recordUsage(
    { userId: job.user_id, pipeline, bookId: job.book_id, jobId: job.id },
    [{ kind: "job", quantity: durationMs, unit: "ms",
       meta: { job_kind: job.kind, status: job.status } }]
  );
}
```

- [ ] **Step 5: Kör testet och koppla in**

```bash
cd apps/web && npx vitest run src/lib/usage/record-job.test.ts
```

Anropa sedan `recordJobCompletion(job)` på varje ställe från Step 1.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/usage/record-job.ts apps/web/src/lib/usage/record-job.test.ts apps/web/scripts
git commit -m "feat(usage): record job duration and outcome, including failures

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 10: Storage-snapshot per användare

**Files:**
- Create: `apps/web/scripts/usage-storage-snapshot.ts`
- Test: `apps/web/src/lib/usage/storage-snapshot.test.ts`
- Create: `apps/web/src/lib/usage/storage-snapshot.ts`
- Modify: `apps/web/package.json` (script `usage:storage`)

**Interfaces:**
- Produces: `summarizeBucket(files: { name: string; metadata: { size: number } | null }[], ownerOf: (path: string) => string | null): Map<string, number>`

- [ ] **Step 1: Skriv det fallerande testet**

```ts
// apps/web/src/lib/usage/storage-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { summarizeBucket } from "./storage-snapshot";

const ownerOf = (p: string) => p.split("/")[0] || null;

describe("summarizeBucket", () => {
  it("sums bytes per owning user", () => {
    const out = summarizeBucket(
      [
        { name: "user-1/a.mp3", metadata: { size: 100 } },
        { name: "user-1/b.mp3", metadata: { size: 250 } },
        { name: "user-2/c.mp3", metadata: { size: 400 } },
      ],
      ownerOf
    );
    expect(out.get("user-1")).toBe(350);
    expect(out.get("user-2")).toBe(400);
  });

  it("ignores files with no size rather than counting them as zero-byte", () => {
    const out = summarizeBucket([{ name: "user-1/a.mp3", metadata: null }], ownerOf);
    expect(out.has("user-1")).toBe(false);
  });

  it("ignores paths with no resolvable owner", () => {
    const out = summarizeBucket([{ name: "orphan.mp3", metadata: { size: 10 } }], () => null);
    expect(out.size).toBe(0);
  });
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/storage-snapshot.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./storage-snapshot"`.

- [ ] **Step 3: Implementera den rena funktionen**

```ts
// apps/web/src/lib/usage/storage-snapshot.ts

/**
 * Bytes per owning user for one bucket listing.
 *
 * A file whose size is unknown is skipped, not counted as zero: a silent zero
 * would look like a user who stores nothing, which is the one answer we must
 * not get wrong when this drives pricing.
 */
export function summarizeBucket(
  files: { name: string; metadata: { size: number } | null }[],
  ownerOf: (path: string) => string | null
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const file of files) {
    const size = file.metadata?.size;
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    const owner = ownerOf(file.name);
    if (!owner) continue;
    totals.set(owner, (totals.get(owner) ?? 0) + size);
  }
  return totals;
}
```

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/lib/usage/storage-snapshot.test.ts
```

- [ ] **Step 5: Skriv scriptet**

```ts
// apps/web/scripts/usage-storage-snapshot.ts
import { createAdminClient } from "../src/lib/supabase/admin";
import { summarizeBucket } from "../src/lib/usage/storage-snapshot";
import { recordUsage } from "../src/lib/usage/meter";

const BUCKETS = ["book-covers", "audiobooks", "book-imports", "avatars", "marketing-assets"];

async function listAll(admin: ReturnType<typeof createAdminClient>, bucket: string) {
  const out: { name: string; metadata: { size: number } | null }[] = [];
  const pageSize = 1000;
  let offset = 0;
  // Paginated on purpose: `list()` caps at 100 by default, so an unpaginated
  // call silently under-reports every bucket past the first hundred files.
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list("", { limit: pageSize, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as typeof out));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function main() {
  const admin = createAdminClient();
  for (const bucket of BUCKETS) {
    const files = await listAll(admin, bucket);
    const totals = summarizeBucket(files, (p) => p.split("/")[0] || null);
    for (const [userId, bytes] of totals) {
      await recordUsage(
        { userId, pipeline: "import" },
        [{ kind: "storage_snapshot", provider: "supabase", model: bucket,
           quantity: bytes, unit: "bytes", meta: { bucket } }]
      );
    }
    console.info(`[usage:storage] ${bucket}: ${totals.size} users, ${files.length} files`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Lägg till npm-scriptet och kör det skarpt**

Lägg `"usage:storage": "tsx scripts/usage-storage-snapshot.ts"` i `apps/web/package.json`.

```bash
cd apps/web && npm run usage:storage
```

Förväntat: en rad per bucket. Verifiera att rader landade:

```bash
cd apps/web && npx tsx -e "
import { createAdminClient } from './src/lib/supabase/admin';
const { count } = await createAdminClient()
  .from('usage_events').select('*', { count: 'exact', head: true })
  .eq('kind','storage_snapshot');
console.log('storage_snapshot rader:', count);
"
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/usage-storage-snapshot.ts apps/web/src/lib/usage/storage-snapshot.ts apps/web/src/lib/usage/storage-snapshot.test.ts apps/web/package.json
git commit -m "feat(usage): nightly per-user storage snapshot

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 11: Egress-loggning

**Files:**
- Create: `apps/web/src/lib/usage/record-egress.ts`
- Test: `apps/web/src/lib/usage/record-egress.test.ts`
- Modify: de sex `createSignedUrl`-anropen

**Interfaces:**
- Produces: `recordEgressGrant(args: { userId; bucket; path; bytes; bookId? }): Promise<void>`

Detta mäter **utfärdad**, inte levererad, egress. Bytesen går Supabase → webbläsare via 302 och rör aldrig vår server. Raden är en fördelningsnyckel, inte en faktura.

- [ ] **Step 1: Skriv det fallerande testet**

```ts
// apps/web/src/lib/usage/record-egress.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const recordUsageMock = vi.fn();
vi.mock("./meter", () => ({ recordUsage: (...a: unknown[]) => recordUsageMock(...a) }));

const { recordEgressGrant } = await import("./record-egress");

describe("recordEgressGrant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records granted bytes and marks them estimated", async () => {
    await recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "user-1/ch1.mp3", bytes: 52_428_800 });
    const [ctx, events] = recordUsageMock.mock.calls[0];
    expect(ctx.userId).toBe("user-1");
    expect(events[0]).toMatchObject({ kind: "egress_grant", quantity: 52_428_800, unit: "bytes" });
    expect(events[0].meta).toMatchObject({ estimated: true, bucket: "audiobooks" });
  });

  it("skips a grant with unknown size instead of recording zero bytes", async () => {
    await recordEgressGrant({ userId: "user-1", bucket: "audiobooks", path: "x", bytes: null });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/lib/usage/record-egress.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./record-egress"`.

- [ ] **Step 3: Implementera**

```ts
// apps/web/src/lib/usage/record-egress.ts
import { recordUsage } from "./meter";

/**
 * Records that a signed URL was issued for a file of known size.
 *
 * This is NOT measured egress. Files are served by a 302 to Supabase, so the
 * bytes never cross our server and no middleware can see them. Streaming them
 * through Next.js would make the number exact and move the entire audio load
 * into Railway's compute bill — the cure costing more than the disease.
 *
 * So: this over-counts (an issued URL may never be fetched) and under-counts
 * (one URL can serve many range requests). Treat it as an allocation key for
 * splitting Supabase's true egress total between users, never as an invoice.
 */
export async function recordEgressGrant(args: {
  userId: string;
  bucket: string;
  path: string;
  bytes: number | null;
  bookId?: string | null;
}): Promise<void> {
  if (typeof args.bytes !== "number" || !Number.isFinite(args.bytes) || args.bytes <= 0) return;
  await recordUsage(
    { userId: args.userId, pipeline: "tts", bookId: args.bookId ?? null },
    [{ kind: "egress_grant", provider: "supabase", model: args.bucket,
       quantity: args.bytes, unit: "bytes",
       meta: { estimated: true, bucket: args.bucket, path: args.path } }]
  );
}
```

- [ ] **Step 4: Kör testet och koppla in**

```bash
cd apps/web && npx vitest run src/lib/usage/record-egress.test.ts
```

Anropa sedan `recordEgressGrant` efter varje `createSignedUrl`. Filstorleken hämtas ur samma `list()`-anrop som redan sker, eller via `admin.storage.from(bucket).list(dir, { search: filename })`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/usage/record-egress.ts apps/web/src/lib/usage/record-egress.test.ts apps/web/src/app/api
git commit -m "feat(usage): log issued egress as an allocation key

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 12: Aggregerings-API för admin

**Files:**
- Create: `apps/web/src/app/api/admin/usage/route.ts`
- Test: `apps/web/src/app/api/admin/usage/route.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/usage?from=&to=&groupBy=user|pipeline|day` → `{ rows: UsageRow[] }`

- [ ] **Step 1: Skriv det fallerande testet**

```ts
// apps/web/src/app/api/admin/usage/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdminForApi: () => checkAdminMock() }));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fromMock }) }));

const { GET } = await import("./route");

describe("GET /api/admin/usage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a non-admin", async () => {
    checkAdminMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const res = await GET(new Request("http://x/api/admin/usage"));
    expect(res.status).toBe(403);
  });

  it("returns rows grouped by user for an admin", async () => {
    checkAdminMock.mockResolvedValue({ user: { id: "admin-1" }, response: null });
    fromMock.mockReturnValue({
      select: () => ({ gte: () => ({ lte: () => Promise.resolve({
        data: [{ user_id: "user-1", pipeline: "tts", unit: "chars", quantity_sum: 8120, cost_usd_sum: 1.5, event_count: 2 }],
        error: null,
      }) }) }),
    });
    const res = await GET(new Request("http://x/api/admin/usage?groupBy=user"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({ user_id: "user-1", cost_usd_sum: 1.5 });
  });
});
```

- [ ] **Step 2: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/app/api/admin/usage/route.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./route"`.

- [ ] **Step 3: Implementera**

Läs först hur andra admin-routes gör auth:

```bash
cd apps/web && sed -n '1,30p' src/app/api/admin/metrics/funnel/route.ts
```

Använd exakt samma vaktfunktion. Läs `usage_daily`, inte `usage_events` — sidan ska vara snabb när radantalet växer. Stöd `groupBy=user|pipeline|day` samt `from`/`to` (default: innevarande månad).

- [ ] **Step 4: Kör testet och se att det passerar**

```bash
cd apps/web && npx vitest run src/app/api/admin/usage/route.test.ts && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/admin/usage/
git commit -m "feat(usage): admin usage aggregation endpoint

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 13: `/admin/usage` med CSV-export

**Files:**
- Create: `apps/web/src/app/admin/usage/page.tsx`
- Create: `apps/web/src/app/api/admin/usage/export/route.ts`
- Test: `apps/web/src/app/api/admin/usage/export/route.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/usage` (Task 12)

- [ ] **Step 1: Läs designsystemet först**

```bash
cat /Users/admin/verkli-web/DESIGN.md
```

Inga nya färger, inga egna skuggor, inga nya avstånd. Följ befintlig admin-layout:

```bash
cd apps/web && sed -n '1,60p' src/app/admin/page.tsx && ls src/app/admin/_components
```

- [ ] **Step 2: Skriv det fallerande CSV-testet**

```ts
// apps/web/src/app/api/admin/usage/export/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdminMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ requireAdminForApi: () => checkAdminMock() }));

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fromMock }) }));

const { GET } = await import("./route");

describe("GET /api/admin/usage/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a non-admin", async () => {
    checkAdminMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    expect((await GET(new Request("http://x"))).status).toBe(403);
  });

  it("returns CSV with a header row", async () => {
    checkAdminMock.mockResolvedValue({ user: { id: "admin-1" }, response: null });
    fromMock.mockReturnValue({
      select: () => ({ gte: () => ({ lte: () => Promise.resolve({
        data: [{ user_id: "user-1", day: "2026-09-22", pipeline: "tts", provider: "elevenlabs",
                 unit: "chars", quantity_sum: 8120, cost_usd_sum: 1.5, event_count: 2 }],
        error: null }) }) }),
    });
    const res = await GET(new Request("http://x"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("user_id,day,pipeline,provider,unit,quantity_sum,cost_usd_sum,event_count");
    expect(text).toContain("user-1,2026-09-22,tts,elevenlabs,chars,8120,1.5,2");
  });
});
```

- [ ] **Step 3: Kör testet och se att det fallerar**

```bash
cd apps/web && npx vitest run src/app/api/admin/usage/export/route.test.ts
```

Förväntat: FAIL, `Failed to resolve import "./route"`.

- [ ] **Step 4: Implementera CSV-routen och sidan**

Sidan har tre vyer: per användare, per pipeline, över tid. Märk egress-kolumnen som **uppskattad** i UI:t — den är en fördelningsnyckel, inte en mätning, och en admin som inte vet det kommer prissätta på en siffra hen tror är exakt.

- [ ] **Step 5: Verifiera i webbläsaren**

```bash
cd apps/web && npm run dev
```

Öppna `http://localhost:3000/admin/usage`. Kontrollera: laddar, visar rader, CSV-knappen laddar ner en fil, och sidan nekar en icke-admin.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/usage/ apps/web/src/app/api/admin/usage/
git commit -m "feat(usage): /admin/usage dashboard with CSV export

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 14: Hoprullning

**Files:**
- Create: `apps/web/supabase/migrations/20260922110000_usage_rollup.sql`
- Create: `apps/web/scripts/usage-rollup.ts`
- Modify: `apps/web/package.json` (script `usage:rollup`)

**Interfaces:**
- Produces: `public.roll_up_usage(p_day date)` — idempotent.

- [ ] **Step 1: Skriv migrationen**

```sql
-- Rolls one day of usage_events into usage_daily. Idempotent: re-running a day
-- overwrites that day's totals rather than doubling them, so a retried cron is
-- safe.
CREATE OR REPLACE FUNCTION public.roll_up_usage(p_day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.usage_daily WHERE day = p_day;

  INSERT INTO public.usage_daily
    (user_id, day, pipeline, provider, unit, quantity_sum, cost_usd_sum, event_count)
  SELECT
    user_id, p_day, COALESCE(pipeline, ''), COALESCE(provider, ''), unit,
    SUM(quantity), COALESCE(SUM(cost_usd), 0), COUNT(*)
  FROM public.usage_events
  WHERE occurred_at >= p_day AND occurred_at < p_day + 1
  GROUP BY user_id, COALESCE(pipeline, ''), COALESCE(provider, ''), unit;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_up_usage(date) FROM anon, authenticated;
```

- [ ] **Step 2: Applicera och verifiera**

```bash
cd apps/web && npm run db:push && npx tsx -e "
import { createAdminClient } from './src/lib/supabase/admin';
const { data, error } = await createAdminClient().rpc('roll_up_usage', { p_day: new Date().toISOString().slice(0,10) });
console.log(error ? 'FEL: ' + error.message : 'rullade ' + data + ' rader');
"
```

- [ ] **Step 3: Skriv cron-scriptet**

```ts
// apps/web/scripts/usage-rollup.ts
import { createAdminClient } from "../src/lib/supabase/admin";

const RETENTION_DAYS = 90;

async function main() {
  const admin = createAdminClient();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await admin.rpc("roll_up_usage", { p_day: yesterday });
  if (error) throw new Error(`rollup failed: ${error.message}`);
  console.info(`[usage:rollup] ${yesterday}: ${data} daily rows`);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error: pruneError } = await admin
    .from("usage_events").delete().lt("occurred_at", cutoff);
  if (pruneError) throw new Error(`prune failed: ${pruneError.message}`);
  console.info(`[usage:rollup] pruned events older than ${cutoff}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Lägg `"usage:rollup": "tsx scripts/usage-rollup.ts"` i `apps/web/package.json`.

- [ ] **Step 4: Kör hela sviten**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20260922110000_usage_rollup.sql apps/web/scripts/usage-rollup.ts apps/web/package.json
git commit -m "feat(usage): daily rollup with 90-day raw-event retention

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 15: Skarp verifiering före launch

Ingen ny kod. Detta är gaten som avgör om mätaren faktiskt mäter, och den ska köras mot **prod**, inte mot en laptop.

- [ ] **Step 1: Verifiera att tabellerna är stängda för klienter**

```bash
cd apps/web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
for (const t of ['usage_events','usage_daily','usage_price_book']) {
  const { data, error } = await anon.from(t).select('*').limit(1);
  console.log(t, error ? 'BLOCKERAD (bra): ' + error.message : 'LÄCKER: ' + JSON.stringify(data));
}
"
```

Förväntat: tre `BLOCKERAD`. Ett `LÄCKER` med tom array är **inte** godkänt: en policy med `TO authenticated` ger anon noll tillämpliga policies, så varje anon-count blir 0 för alltid och ser ut som en tom tabell.

- [ ] **Step 2: Kör ett skarpt AI-anrop och se att raden dyker upp**

Trigga en editorial review eller en ljudboksförhandsvisning i UI:t, och kontrollera sedan:

```bash
cd apps/web && npx tsx -e "
import { createAdminClient } from './src/lib/supabase/admin';
const { data } = await createAdminClient()
  .from('usage_events').select('occurred_at, provider, model, unit, quantity, cost_usd, pipeline')
  .order('occurred_at', { ascending: false }).limit(10);
console.table(data);
"
```

Förväntat: rader med verkliga kvantiteter. `cost_usd: null` är okej och betyder att priset saknas i prisboken — men `quantity: 0` överallt betyder att mätaren inte läser provider-svaret.

- [ ] **Step 3: Fyll prisboken**

För varje distinkt `provider`+`model`+`unit` som nu finns i `usage_events`, lägg en rad i `usage_price_book` med aktuellt listpris från respektive leverantörs prissida. Bekräfta varje siffra mot leverantören — gissa inte.

```bash
cd apps/web && npx tsx -e "
import { createAdminClient } from './src/lib/supabase/admin';
const { data } = await createAdminClient()
  .from('usage_events').select('provider, model, unit').not('provider','is',null);
const seen = new Set((data ?? []).map(r => r.provider + '|' + r.model + '|' + r.unit));
console.log('Behöver pris:', [...seen].join('\n'));
"
```

- [ ] **Step 4: Bekräfta att inget flöde blev långsammare eller trasigt**

Kör igenom: importera en bok, generera ett omslag, starta en ljudbok, begär en editorial review. Alla ska fungera exakt som före. Om ett flöde nu failar har mätaren brutit sitt kontrakt — den ska aldrig kunna fälla anroparen.

- [ ] **Step 5: Kör hela QA-grinden**

```bash
cd apps/web && npm run qa:beta
```

---

## Self-Review

**Spec-täckning:** AI-mätning (Task 4–8), storage (10), egress (11), jobb (9), admin-UI (12–13), CSV (13), hoprullning + 90-dagars gallring (14), price book (2), service-role-RLS (1), fire-and-forget (3), testning (genomgående), skarp verifiering (15). Alla spec-avsnitt har en task.

**Platshållare:** inga TBD/TODO. Varje kodsteg innehåller körbar kod.

**Typkonsistens:** `MeterContext`, `UsageEventInput`, `UsageUnit`, `Pipeline` definieras i Task 2 och används oförändrade i Task 3–11. `recordUsage(ctx, events)` har samma signatur överallt. `recordJobCompletion`, `recordEgressGrant` och `summarizeBucket` definieras en gång var.

**Känd risk:** Task 8 ändrar signaturer som befintliga tester anropar — därför kör den hela sviten, inte bara de nya filerna.
