import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { apiError, E_INVALID_JSON, E_VALIDATION_FAILED, E_DATABASE_ERROR } from "@/lib/api-errors";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  price_monthly: z.number().int().min(100).max(100_000).optional(),
  currency: z.string().length(3).toLowerCase().optional(),
  description: z.string().max(400).nullable().optional(),
});

/** GET: return the author's subscription plan config. */
export async function GET() {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const { data } = await supabase
    .from("author_subscription_plans" as never)
    .select("id, enabled, price_monthly, currency, description")
    .eq("author_id", user.id)
    .maybeSingle();

  return NextResponse.json(
    data ?? { enabled: false, price_monthly: 4900, currency: "sek", description: null }
  );
}

/** PUT: create/update the author's subscription plan. */
export async function PUT(request: Request) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("author_subscription_plans" as never)
    .upsert(
      {
        author_id: user.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "author_id" }
    );

  if (error) {
    console.error("[author subscription-plan] upsert failed", { userId: user.id, message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ ok: true });
}
