import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_FUNNEL_DATA_LOAD_FAILED } from "@/lib/api-errors";
import { requireAdminRoleForApi } from "@/lib/admin-auth";

type EventCount = { event_name: string; count: number };

type Cohort = {
  waitlist_signups: number;
  beta_grants: number;
  first_publish: number;
  first_read: number;
  retention_7d: {
    rate: number;
    returning: number;
    eligible: number;
    window_days: number;
  };
};

type FunnelResponse = {
  since: string;
  author: EventCount[];
  reader: EventCount[];
  cohort: Cohort;
};

const ZERO_COHORT: Cohort = {
  waitlist_signups: 0,
  beta_grants: 0,
  first_publish: 0,
  first_read: 0,
  retention_7d: { rate: 0, returning: 0, eligible: 0, window_days: 7 },
};

export async function GET() {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const admin = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  const primaryQuery = await admin
    .from("analytics_events")
    .select("event_type, event_name, path")
    .gte("created_at", sinceIso);

  let rows = primaryQuery.data as
    | Array<{ event_type?: string | null; event_name?: string | null; path?: string | null }>
    | null;
  let queryError = primaryQuery.error;

  if (queryError && /event_type/i.test(queryError.message ?? "")) {
    const fallbackQuery = await admin
      .from("analytics_events")
      .select("event_name, path")
      .gte("created_at", sinceIso);

    rows = fallbackQuery.data as Array<{ event_name?: string | null; path?: string | null }> | null;
    queryError = fallbackQuery.error;
  }

  if (queryError) {
    console.error("[funnel] analytics_events load failed", {
      message: queryError.message,
      code: queryError.code,
    });
    return apiError(E_FUNNEL_DATA_LOAD_FAILED, 500);
  }

  const authorCounts: Record<string, number> = {};
  const readerCounts: Record<string, number> = {};

  for (const row of rows ?? []) {
    const name = row.event_type ?? row.event_name ?? "unknown";
    const path = (row.path as string) ?? "";
    const isAuthor = path.startsWith("/author") || path.includes("author");
    const isReader = path.startsWith("/reader") || path.includes("reader");

    if (isAuthor) {
      authorCounts[name] = (authorCounts[name] ?? 0) + 1;
    }
    if (isReader) {
      readerCounts[name] = (readerCounts[name] ?? 0) + 1;
    }
    if (!isAuthor && !isReader) {
      authorCounts[name] = (authorCounts[name] ?? 0) + 1;
      readerCounts[name] = (readerCounts[name] ?? 0) + 1;
    }
  }

  const author = Object.entries(authorCounts).map(([event_name, count]) => ({ event_name, count }));
  const reader = Object.entries(readerCounts).map(([event_name, count]) => ({ event_name, count }));

  author.sort((a, b) => b.count - a.count);
  reader.sort((a, b) => b.count - a.count);

  const cohort = await loadCohortMetrics(admin);

  const body: FunnelResponse = {
    since: sinceIso,
    author,
    reader,
    cohort,
  };

  return NextResponse.json(body);
}

async function loadCohortMetrics(
  admin: ReturnType<typeof createAdminClient>
): Promise<Cohort> {
  // Each query is wrapped in a try/catch so one failed cohort metric does not
  // collapse the rest of the dashboard. Failures are logged via console.error
  // so they're never silent (PR 2 observability hard rule).
  const [
    authorWaitlist,
    readerWaitlist,
    betaGrants,
    firstPublish,
    firstRead,
    retention,
  ] = await Promise.all([
    countTableRows(admin, "waitlist", "waitlist (author)"),
    countTableRows(admin, "reader_waitlist", "reader_waitlist"),
    countBetaGrants(admin),
    countFirstPublishAuthors(admin),
    countFirstReadUsers(admin),
    computeRetention7d(admin),
  ]);

  return {
    waitlist_signups: authorWaitlist + readerWaitlist,
    beta_grants: betaGrants,
    first_publish: firstPublish,
    first_read: firstRead,
    retention_7d: retention,
  };
}

async function countTableRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  label: string
): Promise<number> {
  try {
    const { count, error } = await admin
      .from(table as never)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error(`[funnel] count ${label} failed`, {
        table,
        message: error.message,
        code: error.code,
      });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`[funnel] count ${label} threw`, {
      table,
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function countBetaGrants(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  try {
    const { count, error } = await admin
      .from("user_flags")
      .select("*", { count: "exact", head: true })
      .eq("beta_enabled", true);
    if (error) {
      console.error("[funnel] count beta_grants failed", {
        message: error.message,
        code: error.code,
      });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[funnel] count beta_grants threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function countFirstPublishAuthors(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  // first_publish = number of distinct authors who have at least one published
  // book. Using `published = true` rather than scanning analytics_events keeps
  // this stable even if the publish event was missed (e.g. before this PR).
  try {
    const { data, error } = await admin
      .from("books")
      .select("author_id")
      .eq("published", true)
      .not("author_id", "is", null);
    if (error) {
      console.error("[funnel] count first_publish failed", {
        message: error.message,
        code: error.code,
      });
      return 0;
    }
    const distinct = new Set<string>();
    for (const row of (data ?? []) as Array<{ author_id: string | null }>) {
      if (row.author_id) distinct.add(row.author_id);
    }
    return distinct.size;
  } catch (err) {
    console.error("[funnel] count first_publish threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function countFirstReadUsers(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  // first_read = number of distinct users who triggered a start_reading event.
  // Anonymous (user_id = null) reads are excluded — they cannot be attributed
  // to a cohort member.
  try {
    const { data, error } = await admin
      .from("analytics_events")
      .select("user_id")
      .eq("event_type", "start_reading")
      .not("user_id", "is", null);
    if (error) {
      console.error("[funnel] count first_read failed", {
        message: error.message,
        code: error.code,
      });
      return 0;
    }
    const distinct = new Set<string>();
    for (const row of (data ?? []) as Array<{ user_id: string | null }>) {
      if (row.user_id) distinct.add(row.user_id);
    }
    return distinct.size;
  } catch (err) {
    console.error("[funnel] count first_read threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function computeRetention7d(
  admin: ReturnType<typeof createAdminClient>
): Promise<Cohort["retention_7d"]> {
  // Approximation: a user is "retained" if they have any analytics_event in
  // the last 7 days AND at least one event in the 7 days before that. The
  // denominator is users with events in the prior window.
  const now = Date.now();
  const recentCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const priorCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [recent, prior] = await Promise.all([
      admin
        .from("analytics_events")
        .select("user_id, created_at")
        .gte("created_at", recentCutoff)
        .not("user_id", "is", null),
      admin
        .from("analytics_events")
        .select("user_id, created_at")
        .gte("created_at", priorCutoff)
        .lt("created_at", recentCutoff)
        .not("user_id", "is", null),
    ]);

    if (recent.error || prior.error) {
      console.error("[funnel] retention_7d query failed", {
        recent: recent.error?.message ?? null,
        prior: prior.error?.message ?? null,
      });
      return ZERO_COHORT.retention_7d;
    }

    const recentUsers = new Set<string>();
    for (const row of (recent.data ?? []) as Array<{ user_id: string | null }>) {
      if (row.user_id) recentUsers.add(row.user_id);
    }

    const priorUsers = new Set<string>();
    for (const row of (prior.data ?? []) as Array<{ user_id: string | null }>) {
      if (row.user_id) priorUsers.add(row.user_id);
    }

    let returning = 0;
    for (const u of priorUsers) {
      if (recentUsers.has(u)) returning += 1;
    }
    const eligible = priorUsers.size;
    const rate = eligible > 0 ? returning / eligible : 0;

    return {
      rate: Math.round(rate * 1000) / 1000, // 3 decimal places
      returning,
      eligible,
      window_days: 7,
    };
  } catch (err) {
    console.error("[funnel] retention_7d threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return ZERO_COHORT.retention_7d;
  }
}
