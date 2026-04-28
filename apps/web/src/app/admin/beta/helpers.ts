/**
 * Pure helpers for the /admin/beta dashboard. Extracted so the kill-criteria
 * thresholds and state derivation can be unit-tested without rendering the
 * client component (vitest runs in node, no jsdom in this project).
 *
 * The dashboard consumes /api/admin/metrics/funnel verbatim — these helpers
 * never query the DB or call any other endpoint.
 */

export type Retention7d = {
  rate: number;
  returning: number;
  eligible: number;
  window_days: number;
};

export type CohortMetrics = {
  waitlist_signups: number;
  beta_grants: number;
  first_publish: number;
  first_read: number;
  retention_7d: Retention7d;
};

export type FunnelResponse = {
  since: string;
  author: Array<{ event_name: string; count: number }>;
  reader: Array<{ event_name: string; count: number }>;
  cohort: CohortMetrics;
};

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; cohort: CohortMetrics }
  | { kind: "ready"; cohort: CohortMetrics };

// ── Kill criteria ────────────────────────────────────────────────────────────

/**
 * Below this 7-day retention rate the cohort is at risk of churning out before
 * any meaningful signal accumulates. The threshold deliberately mirrors the
 * product team's soft-launch kill criterion (CEO plan §B2): if a cohort can't
 * keep one in five users active week-over-week we have a deeper problem than
 * the dashboard can fix.
 */
export const RETENTION_FLOOR_RATE = 0.2;

/**
 * Eligible-cohort floor below which the retention rate is too noisy to react
 * to. With four or fewer eligible users a single drop-off swings the rate by
 * 25%+. We surface the warning only when the denominator is large enough to
 * trust.
 */
export const RETENTION_ELIGIBLE_FLOOR = 5;

/**
 * Below this number of cumulative beta_grants we have no realistic publishing
 * pipeline yet, so a zero first_publish count is uninformative — not a kill.
 */
export const ZERO_PUBLISH_GRANT_FLOOR = 1;

export type KillCriteria = {
  lowRetention: boolean;
  zeroPublish: boolean;
  warnings: string[];
};

export function evaluateKillCriteria(cohort: CohortMetrics): KillCriteria {
  const warnings: string[] = [];

  const lowRetention =
    cohort.retention_7d.eligible >= RETENTION_ELIGIBLE_FLOOR &&
    cohort.retention_7d.rate < RETENTION_FLOOR_RATE;
  if (lowRetention) {
    warnings.push(
      `Retention 7d is ${formatPercent(cohort.retention_7d.rate)} across ${cohort.retention_7d.eligible} eligible users — below the ${formatPercent(RETENTION_FLOOR_RATE)} kill floor.`
    );
  }

  const zeroPublish =
    cohort.beta_grants >= ZERO_PUBLISH_GRANT_FLOOR && cohort.first_publish === 0;
  if (zeroPublish) {
    warnings.push(
      `${cohort.beta_grants} beta grant${cohort.beta_grants === 1 ? "" : "s"} but no authors have published yet.`
    );
  }

  return { lowRetention, zeroPublish, warnings };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

// ── Empty-state detection ────────────────────────────────────────────────────

/**
 * The dashboard distinguishes a successful response with no signal yet
 * (every cohort metric is zero) from a successful response with at least
 * one non-zero count. The "empty" badge tells admins "we got data, there's
 * just nothing to see yet" — which is meaningfully different from an error.
 */
export function isAllZero(cohort: CohortMetrics): boolean {
  return (
    cohort.waitlist_signups === 0 &&
    cohort.beta_grants === 0 &&
    cohort.first_publish === 0 &&
    cohort.first_read === 0 &&
    cohort.retention_7d.eligible === 0
  );
}

// ── Response → LoadState ─────────────────────────────────────────────────────

/**
 * Maps a fetch result to the visible LoadState. The page reduces all of its
 * branching down to "show this state" via this single function so that
 * loading/empty/error/ready presentation is consistent across all paths.
 */
export function deriveLoadState(input: {
  status: "loading" | "fetched" | "error";
  httpStatus?: number;
  body?: unknown;
}): LoadState {
  if (input.status === "loading") return { kind: "loading" };

  if (input.status === "error") {
    return {
      kind: "error",
      message: "Could not load funnel metrics. Try again in a moment.",
    };
  }

  if (typeof input.httpStatus === "number" && input.httpStatus >= 400) {
    if (input.httpStatus === 401 || input.httpStatus === 403) {
      return {
        kind: "error",
        message: "Access denied — admin role required.",
      };
    }
    return {
      kind: "error",
      message: `Funnel endpoint returned ${input.httpStatus}.`,
    };
  }

  const body = input.body as FunnelResponse | null;
  const cohort = body?.cohort;
  if (!cohort || typeof cohort !== "object") {
    return {
      kind: "error",
      message: "Funnel response missing the cohort block.",
    };
  }

  if (isAllZero(cohort)) {
    return { kind: "empty", cohort };
  }
  return { kind: "ready", cohort };
}
