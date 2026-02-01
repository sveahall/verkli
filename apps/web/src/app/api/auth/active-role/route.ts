import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import { wrapApiRoute, jsonError, ERROR_CODES } from "@/lib/api/errors";
import { activeRoleBodySchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";
import { auditLog } from "@/lib/api/audit";

async function postHandler(
  request: Request,
  ctx: { requestId: string }
): Promise<Response> {
  const key = rateLimitKey(request, "/api/auth/active-role");
  if (!checkRateLimit(key, { windowMs: 60 * 1000, max: 20 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many requests. Try again later.", ctx.requestId, 429);
  }
  const raw = await request.json().catch(() => null);
  const parsed = activeRoleBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(parsed), ctx.requestId, 400);
  }
  const { role } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
    return jsonError(ERROR_CODES.NOT_AUTHENTICATED, "Not authenticated", ctx.requestId, 401);
  }

  await auditLog({
    actorUserId: user.id,
    actorRole: role,
    action: "active_role.set",
    entityType: "user",
    entityId: user.id,
    requestId: ctx.requestId,
    meta: { role },
  }).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": ctx.requestId } });
}

export const POST = wrapApiRoute(postHandler);
