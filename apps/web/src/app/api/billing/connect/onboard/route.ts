import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { recordAudit, auditMetadataFromRequest } from "@/lib/audit";
import { getRequestBaseUrl } from "@/lib/request-url";
import {
  createOnboardingLink,
  getOrCreateConnectAccount,
} from "@/lib/payments/stripe-connect";
import { apiError, E_GENERIC_ERROR, E_RATE_LIMIT_EXCEEDED } from "@/lib/api-errors";

const onboardLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const rl = await onboardLimiter.check(auth.user.id);
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const country =
    typeof body?.country === "string" && body.country.trim().length === 2
      ? body.country.trim().toUpperCase()
      : null;

  const baseUrl = getRequestBaseUrl(request);
  const admin = createAdminClient();

  try {
    const account = await getOrCreateConnectAccount(admin, {
      userId: auth.user.id,
      email: auth.user.email ?? null,
      country,
    });

    const url = await createOnboardingLink({
      stripeAccountId: account.stripe_account_id,
      returnUrl: `${baseUrl}/api/billing/connect/return`,
      refreshUrl: `${baseUrl}/api/billing/connect/refresh`,
    });

    // Fire-and-forget audit; don't block response on it.
    recordAudit(admin, {
      action: "billing.connect_onboarded",
      target: { type: "billing_account", id: auth.user.id },
      after: {
        stripe_account_id: account.stripe_account_id,
        country: account.country,
      },
      metadata: auditMetadataFromRequest(request),
    }).catch(() => {});

    return NextResponse.json({ url, accountId: account.stripe_account_id });
  } catch (err) {
    console.error("[billing.connect.onboard] failed", {
      userId: auth.user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
