import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";
import {
  apiError,
  E_INVALID_ROLE,
  E_NOT_AUTHENTICATED,
  E_FORBIDDEN,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const VALID_ROLES: ActiveRole[] = ["author", "reader"];

const limiter = createPerUserRateLimiter({ maxPerMinute: 10 });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as ActiveRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return apiError(E_INVALID_ROLE, 400);
  }

  // Authenticate first so we can rate-limit per user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rateCheck = limiter.check(user.id);
  if (!rateCheck.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
    // "Not authenticated" → 401; any other rejection (role restriction) → 403
    const isAuthError = result.error === "Not authenticated";
    return apiError(
      isAuthError ? E_NOT_AUTHENTICATED : E_FORBIDDEN,
      isAuthError ? 401 : 403,
    );
  }

  return NextResponse.json({ ok: true });
}
