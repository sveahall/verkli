export type AuthorApplicationStatus = "pending" | "approved" | "rejected";

type SupabaseLikeClient = {
  from: (table: string) => unknown;
};

export async function getAuthorApplicationStatus(
  supabase: SupabaseLikeClient,
  userId: string
): Promise<AuthorApplicationStatus | null> {
  if (!userId) return null;

  const query = supabase.from("author_applications" as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { status?: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await query.select("status").eq("user_id", userId).maybeSingle();

  if (error || !data) return null;

  const status = String((data as { status?: string }).status ?? "").toLowerCase();
  if (status === "pending" || status === "approved" || status === "rejected") {
    return status;
  }
  return null;
}

/**
 * Legacy authors (profiles.role or metadata role = author) are treated as approved.
 * Readers must have an approved author_application.
 */
export function isLegacyAuthorRole(role: string | null | undefined): boolean {
  return String(role ?? "").toLowerCase() === "author";
}
