/**
 * In-memory token/usage budget gate for AI workers.
 *
 * Tracks daily and monthly usage per key (orgId or userId).
 *
 * IMPORTANT LIMITATIONS:
 * - Counters live in process memory — restarting a worker resets all budgets.
 * - Each worker process has its own counters — running 2 instances of the same
 *   worker effectively doubles the allowed budget.
 * - This is acceptable for Beta (single-instance workers). For production
 *   multi-instance deployment, replace the Map store with Redis INCRBY counters
 *   using keys like `budget:{userId}:{YYYY-MM-DD}` with TTL auto-expiry.
 *
 * DEFAULT BEHAVIOR: If no budget key is available (should not happen in practice
 * since all jobs carry userId/authorId), the calling worker skips the check and
 * logs a warning — jobs are never blocked by a missing key.
 *
 * Defaults: 100 000 tokens/day, 3 000 000 tokens/month.
 */

export interface BudgetLimits {
  dailyTokens: number;
  monthlyTokens: number;
}

const DEFAULT_LIMITS: BudgetLimits = {
  dailyTokens: 100_000,
  monthlyTokens: 3_000_000,
};

interface UsageBucket {
  tokens: number;
  /** ISO date string (YYYY-MM-DD) for daily bucket */
  day: string;
  /** ISO month string (YYYY-MM) for monthly bucket */
  month: string;
  dailyTokens: number;
  monthlyTokens: number;
}

const store = new Map<string, UsageBucket>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getOrCreate(key: string): UsageBucket {
  const d = today();
  const m = thisMonth();
  const existing = store.get(key);

  if (existing) {
    // Reset daily counter if day changed
    if (existing.day !== d) {
      existing.dailyTokens = 0;
      existing.day = d;
    }
    // Reset monthly counter if month changed
    if (existing.month !== m) {
      existing.monthlyTokens = 0;
      existing.month = m;
    }
    return existing;
  }

  const bucket: UsageBucket = {
    tokens: 0,
    day: d,
    month: m,
    dailyTokens: 0,
    monthlyTokens: 0,
  };
  store.set(key, bucket);
  return bucket;
}

export class BudgetExceededError extends Error {
  constructor(key: string, period: "daily" | "monthly", used: number, limit: number) {
    super(
      `Budget exceeded for "${key}": ${period} usage ${used} >= limit ${limit}`
    );
    this.name = "BudgetExceededError";
  }
}

/**
 * Check whether the key still has budget. Throws BudgetExceededError if not.
 */
export function checkBudget(
  key: string,
  limits: BudgetLimits = DEFAULT_LIMITS
): void {
  const bucket = getOrCreate(key);

  if (bucket.dailyTokens >= limits.dailyTokens) {
    throw new BudgetExceededError(key, "daily", bucket.dailyTokens, limits.dailyTokens);
  }
  if (bucket.monthlyTokens >= limits.monthlyTokens) {
    throw new BudgetExceededError(key, "monthly", bucket.monthlyTokens, limits.monthlyTokens);
  }
}

/**
 * Record token usage after a successful AI call.
 */
export function trackUsage(key: string, tokens: number): void {
  const bucket = getOrCreate(key);
  bucket.dailyTokens += tokens;
  bucket.monthlyTokens += tokens;
  bucket.tokens += tokens;
}

/**
 * Get current usage for a key (for logging/monitoring).
 */
export function getUsage(key: string): { daily: number; monthly: number } | null {
  const bucket = store.get(key);
  if (!bucket) return null;
  // Refresh counters in case of day/month rollover
  const b = getOrCreate(key);
  return { daily: b.dailyTokens, monthly: b.monthlyTokens };
}

/**
 * Reset all tracked usage (useful for tests).
 */
export function resetAllBudgets(): void {
  store.clear();
}
