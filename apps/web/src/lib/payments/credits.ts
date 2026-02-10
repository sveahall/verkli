import { createAdminClient } from "@/lib/supabase/admin";

const MAX_CREDIT_DELTA_RETRIES = 8;

type AdminClient = ReturnType<typeof createAdminClient>;

export type ApplyCreditDeltaAtomicInput = {
  userId: string;
  delta: number;
  minBalance?: number;
  admin?: AdminClient;
};

export type ApplyCreditDeltaAtomicResult = {
  userId: string;
  previousBalance: number;
  nextBalance: number;
  appliedDelta: number;
};

function trimToNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function normalizeTokenBalance(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

async function ensureCreditsRow(admin: AdminClient, userId: string): Promise<void> {
  const { error } = await admin.from("user_credits" as never).upsert(
    {
      user_id: userId,
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(`Failed to initialize user credits: ${error.message}`);
  }
}

async function readTokenBalance(admin: AdminClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("user_credits" as never)
    .select("token_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read user credits: ${error.message}`);
  }

  const row = (data as { token_balance?: unknown } | null) ?? null;
  return normalizeTokenBalance(row?.token_balance);
}

/**
 * Applies a credit delta with a compare-and-swap update so concurrent writes do not lose updates.
 */
export async function applyCreditDeltaAtomic(
  input: ApplyCreditDeltaAtomicInput
): Promise<ApplyCreditDeltaAtomicResult> {
  const userId = trimToNull(input.userId);
  if (!userId) {
    throw new Error("Missing userId");
  }

  const delta = sanitizeInteger(input.delta);
  const minBalance = sanitizeInteger(input.minBalance ?? 0);
  const admin = input.admin ?? createAdminClient();

  await ensureCreditsRow(admin, userId);

  for (let attempt = 0; attempt < MAX_CREDIT_DELTA_RETRIES; attempt += 1) {
    const previousBalance = await readTokenBalance(admin, userId);
    const nextBalance = previousBalance + delta;

    if (nextBalance < minBalance) {
      throw new Error("Insufficient credits for requested delta");
    }

    const { data, error } = await admin
      .from("user_credits" as never)
      .update({ token_balance: nextBalance })
      .eq("user_id", userId)
      .eq("token_balance", previousBalance)
      .select("token_balance")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to apply credit delta: ${error.message}`);
    }

    const row = (data as { token_balance?: unknown } | null) ?? null;
    if (row) {
      return {
        userId,
        previousBalance,
        nextBalance: normalizeTokenBalance(row.token_balance),
        appliedDelta: delta,
      };
    }
  }

  throw new Error("Failed to apply credit delta atomically after retrying");
}
