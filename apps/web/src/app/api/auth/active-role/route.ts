import { updateActiveRole } from "@/features/auth/roles";
import type { ActiveRole } from "@/lib/active-role";
import { activeRoleCookieHeader, isValidActiveRole } from "@/lib/active-role";
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

const limiter = createPerUserRateLimiter({ maxPerMinute: 10 });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as string | undefined;

  if (!role || !isValidActiveRole(role)) {
    return apiError(E_INVALID_ROLE, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rateCheck = await limiter.check(user.id);
  if (!rateCheck.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
  }

  const result = await updateActiveRole(role as ActiveRole);

  if (!result.ok) {
    const isAuthError = result.error === "Not authenticated";
    return apiError(
      isAuthError ? E_NOT_AUTHENTICATED : E_FORBIDDEN,
      isAuthError ? 401 : 403,
    );
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", activeRoleCookieHeader(role as ActiveRole));
  return res;
}
