// Soft-delete helpers (Sprint 0.5 Task 2).
//
// Tables with a `deleted_at` column gain an RLS RESTRICTIVE policy that hides
// soft-deleted rows from authenticated/anon reads. The policy is the
// security backstop. The helpers below are the *correctness* backstop:
//
//   - `SOFT_DELETE_TABLES` — exhaustive list; review before adding new ones.
//   - `applyActiveFilter(query)` — adds `.is('deleted_at', null)` so admin /
//     service-role queries (which bypass RLS) still skip soft-deleted rows.
//   - `softDelete()` flips the column atomically and returns the rows updated.
//   - `restoreSoftDeleted()` clears the column.
//
// Usage:
//   const supabase = createAdminClient();   // bypasses RLS
//   const q = supabase.from("books").select("*");
//   const { data } = await applyActiveFilter(q);

import type { SupabaseClient } from "@supabase/supabase-js";

export const SOFT_DELETE_TABLES = [
  "books",
  "chapters",
  "comments",
  "messages",
  "marketing_campaigns",
  "marketing_posts",
  "reviews",
  "polls",
  "poll_options",
  "book_clubs",
  "book_club_messages",
] as const;

export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

export const SOFT_DELETE_COLUMN = "deleted_at" as const;

type IsFilterable<Q> = Q & { is: (column: string, value: unknown) => Q };

/**
 * Adds a `.is('deleted_at', null)` filter to a Supabase query builder.
 *
 * The query builder type is generic because Supabase chains return different
 * shapes depending on what's already been chained. The runtime contract is
 * that any builder with `.is()` works.
 */
export function applyActiveFilter<Q>(query: IsFilterable<Q>): Q {
  return query.is(SOFT_DELETE_COLUMN, null);
}

type SupabaseLike = Pick<SupabaseClient, "from">;

/**
 * Flag a row as soft-deleted. Idempotent: returns 0 if already deleted.
 */
export async function softDelete(
  supabase: SupabaseLike,
  table: SoftDeleteTable,
  id: string,
  now: Date = new Date()
): Promise<number> {
  // Cast across the typed-schema boundary: supabase-js doesn't yet know about
  // the `deleted_at` column we added in 20260429121000_soft_delete_columns.sql
  // and we don't want to regenerate types as part of this migration.
  type UpdateChain = {
    update: (
      values: Record<string, unknown>,
      options?: { count?: "exact" | "planned" | "estimated" }
    ) => {
      eq: (column: string, value: unknown) => {
        is: (
          column: string,
          value: unknown
        ) => Promise<{ error: { message?: string } | null; count: number | null }>;
      };
    };
  };

  const builder = supabase.from(table as never) as unknown as UpdateChain;
  const { error, count } = await builder
    .update({ deleted_at: now.toISOString() }, { count: "exact" })
    .eq("id", id)
    .is(SOFT_DELETE_COLUMN, null);

  if (error) {
    throw new Error(
      `softDelete(${table}/${id}) failed: ${error.message ?? "unknown"}`
    );
  }
  return count ?? 0;
}

/**
 * Clear the `deleted_at` flag for a previously soft-deleted row.
 */
export async function restoreSoftDeleted(
  supabase: SupabaseLike,
  table: SoftDeleteTable,
  id: string
): Promise<number> {
  type UpdateChain = {
    update: (
      values: Record<string, unknown>,
      options?: { count?: "exact" | "planned" | "estimated" }
    ) => {
      eq: (column: string, value: unknown) => {
        not: (
          column: string,
          op: string,
          value: unknown
        ) => Promise<{ error: { message?: string } | null; count: number | null }>;
      };
    };
  };

  const builder = supabase.from(table as never) as unknown as UpdateChain;
  const { error, count } = await builder
    .update({ deleted_at: null }, { count: "exact" })
    .eq("id", id)
    .not(SOFT_DELETE_COLUMN, "is", null);

  if (error) {
    throw new Error(
      `restoreSoftDeleted(${table}/${id}) failed: ${error.message ?? "unknown"}`
    );
  }
  return count ?? 0;
}
