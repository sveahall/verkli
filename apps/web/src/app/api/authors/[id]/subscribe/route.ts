import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthorSubscriptionCheckoutSession } from "@/lib/payments/stripe";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

type RouteContext = { params: Promise<{ id: string }> };

const E_SUBSCRIPTION_PLAN_NOT_FOUND = "SUBSCRIPTION_PLAN_NOT_FOUND";
const E_ALREADY_SUBSCRIBED = "ALREADY_SUBSCRIBED";
const E_CANNOT_SUBSCRIBE_OWN = "CANNOT_SUBSCRIBE_OWN";
const E_SUBSCRIPTION_CHECKOUT_FAILED = "SUBSCRIPTION_CHECKOUT_FAILED";

/** POST /api/authors/[id]/subscribe — reader starts a subscription checkout. */
export async function POST(request: Request, context: RouteContext) {
  const { id: authorId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);
  if (user.id === authorId) return apiError(E_CANNOT_SUBSCRIBE_OWN, 400);

  // Fetch author's subscription plan
  const { data: plan } = await supabase
    .from("author_subscription_plans" as never)
    .select("enabled, price_monthly, currency, author_id")
    .eq("author_id", authorId)
    .eq("enabled", true)
    .maybeSingle();

  if (!plan) return apiError(E_SUBSCRIPTION_PLAN_NOT_FOUND, 404);

  const planRow = plan as { enabled: boolean; price_monthly: number; currency: string; author_id: string };

  // Check if already subscribed (active)
  const { data: existing } = await supabase
    .from("author_subscriptions" as never)
    .select("id, status")
    .eq("subscriber_user_id", user.id)
    .eq("author_id", authorId)
    .maybeSingle();

  if (existing && (existing as { status: string }).status === "active") {
    return apiError(E_ALREADY_SUBSCRIBED, 409);
  }

  // Fetch author name for checkout
  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", authorId)
    .maybeSingle();

  const authorName =
    authorProfile?.display_name ||
    authorProfile?.username ||
    "Author";

  // Pre-create a subscription record in "incomplete" status
  const admin = createAdminClient();
  const subscriptionRecordId = crypto.randomUUID();

  const { error: insertError } = await admin
    .from("author_subscriptions" as never)
    .upsert(
      {
        id: subscriptionRecordId,
        subscriber_user_id: user.id,
        author_id: authorId,
        status: "incomplete",
        amount_monthly: planRow.price_monthly,
        currency: planRow.currency,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "subscriber_user_id,author_id" }
    );

  if (insertError) {
    console.error("[subscribe] insert failed", { userId: user.id, authorId, message: insertError.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Build absolute URLs
  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/reader/authors/${authorId}?subscribed=1`;
  const cancelUrl = `${origin}/reader/authors/${authorId}`;

  try {
    const session = await createAuthorSubscriptionCheckoutSession({
      authorId,
      authorName,
      priceMonthlyMinor: planRow.price_monthly,
      currency: planRow.currency,
      subscriberUserId: user.id,
      subscriptionRecordId,
      customerEmail: user.email ?? null,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[subscribe] stripe checkout failed", {
      userId: user.id,
      authorId,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_SUBSCRIPTION_CHECKOUT_FAILED, 500);
  }
}
