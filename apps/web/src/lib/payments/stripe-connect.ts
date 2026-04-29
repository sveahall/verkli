import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stripe Connect Express helper (Week 1 / ROADMAP Phase 0.1).
//
// Design:
//   - Each author has at most one Express account; we cache its state in
//     `public.author_payout_accounts`.
//   - Authoritative state is Stripe; we update our row via the
//     `account.updated` webhook handler in stripeWebhook.handlers.ts.
//   - Onboarding uses Stripe-hosted Express flow — we never touch KYC ourselves.
//
// Configuration:
//   - STRIPE_SECRET_KEY: required.
//   - STRIPE_CONNECT_DEFAULT_COUNTRY: optional, defaults to 'SE'.
//   - STRIPE_CONNECT_RETURN_URL / STRIPE_CONNECT_REFRESH_URL: optional;
//     callers can override per-request.

const DEFAULT_COUNTRY = "SE";
const ONBOARDING_TIMEOUT_MS = 15_000;

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY — Stripe Connect cannot be used");
  }
  return new Stripe(key);
}

function defaultCountry(): string {
  const env = process.env.STRIPE_CONNECT_DEFAULT_COUNTRY?.trim();
  return (env && env.length === 2 ? env.toUpperCase() : DEFAULT_COUNTRY);
}

export type ConnectAccount = {
  user_id: string;
  stripe_account_id: string;
  country: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  capabilities: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  payout_schedule: "weekly" | "monthly";
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

type AdminLike = Pick<SupabaseClient, "from">;

/**
 * Read our cached row, or null if the author has not started onboarding.
 */
export async function getPayoutAccount(
  admin: AdminLike,
  userId: string
): Promise<ConnectAccount | null> {
  const { data, error } = await admin
    .from("author_payout_accounts" as never)
    .select(
      "user_id, stripe_account_id, country, payouts_enabled, charges_enabled, details_submitted, capabilities, requirements, payout_schedule, default_currency, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getPayoutAccount failed: ${error.message ?? "unknown"}`);
  }
  return (data ?? null) as ConnectAccount | null;
}

/**
 * Create a new Stripe Connect Express account and persist a row.
 * Idempotent: returns the existing row if already created.
 */
export async function getOrCreateConnectAccount(
  admin: AdminLike,
  args: { userId: string; email: string | null; country?: string | null }
): Promise<ConnectAccount> {
  const existing = await getPayoutAccount(admin, args.userId);
  if (existing) return existing;

  const stripe = getStripeClient();
  const country = (args.country ?? defaultCountry()).toUpperCase();
  const account = await stripe.accounts.create({
    type: "express",
    country,
    email: args.email ?? undefined,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    metadata: {
      verkli_user_id: args.userId,
    },
  });

  const row = mapAccountToRow(args.userId, country, account);

  const { data: inserted, error: insertError } = await (
    admin.from("author_payout_accounts" as never) as unknown as {
      insert: (v: Record<string, unknown>) => {
        select: () => { single: () => Promise<{ data: unknown; error: { message?: string } | null }> };
      };
    }
  )
    .insert(row)
    .select()
    .single();

  if (insertError) {
    throw new Error(
      `Failed to persist new payout account: ${insertError.message ?? "unknown"}`
    );
  }

  return inserted as ConnectAccount;
}

/**
 * Build a Stripe-hosted onboarding URL. Caller redirects user to it.
 */
export async function createOnboardingLink(args: {
  stripeAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: args.stripeAccountId,
    return_url: args.returnUrl,
    refresh_url: args.refreshUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Refresh our cache from Stripe. Used by the `/return` route after onboarding
 * completes (webhook may not have fired yet) and by ad-hoc admin tooling.
 */
export async function syncPayoutAccountFromStripe(
  admin: AdminLike,
  userId: string
): Promise<ConnectAccount> {
  const existing = await getPayoutAccount(admin, userId);
  if (!existing) {
    throw new Error(
      `Cannot sync payout account for ${userId}: no row exists. Onboard first.`
    );
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(existing.stripe_account_id);
  const updates = mapAccountToRow(userId, existing.country, account);

  const { data: updated, error } = await (
    admin.from("author_payout_accounts" as never) as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (
          column: string,
          value: unknown
        ) => {
          select: () => { single: () => Promise<{ data: unknown; error: { message?: string } | null }> };
        };
      };
    }
  )
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to sync payout account ${existing.stripe_account_id}: ${error.message ?? "unknown"}`
    );
  }

  return updated as ConnectAccount;
}

/**
 * Update our row from a Stripe `account.updated` webhook payload. Returns
 * the user_id we touched (or null if the account isn't ours).
 */
export async function applyAccountUpdated(
  admin: AdminLike,
  account: Stripe.Account
): Promise<{ userId: string | null; before: ConnectAccount | null; after: ConnectAccount | null }> {
  const stripeAccountId = account.id;

  const { data: existing, error: lookupError } = await admin
    .from("author_payout_accounts" as never)
    .select(
      "user_id, stripe_account_id, country, payouts_enabled, charges_enabled, details_submitted, capabilities, requirements, payout_schedule, default_currency, created_at, updated_at"
    )
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `applyAccountUpdated lookup failed: ${lookupError.message ?? "unknown"}`
    );
  }
  const before = (existing ?? null) as ConnectAccount | null;
  if (!before) {
    return { userId: null, before: null, after: null };
  }

  const updates = mapAccountToRow(before.user_id, before.country, account);

  const { data: updated, error: updateError } = await (
    admin.from("author_payout_accounts" as never) as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (
          column: string,
          value: unknown
        ) => {
          select: () => { single: () => Promise<{ data: unknown; error: { message?: string } | null }> };
        };
      };
    }
  )
    .update(updates)
    .eq("user_id", before.user_id)
    .select()
    .single();

  if (updateError) {
    throw new Error(
      `applyAccountUpdated write failed: ${updateError.message ?? "unknown"}`
    );
  }

  return {
    userId: before.user_id,
    before,
    after: updated as ConnectAccount,
  };
}

function mapAccountToRow(
  userId: string,
  fallbackCountry: string,
  account: Stripe.Account
): Record<string, unknown> {
  return {
    user_id: userId,
    stripe_account_id: account.id,
    country: account.country ?? fallbackCountry,
    payouts_enabled: Boolean(account.payouts_enabled),
    charges_enabled: Boolean(account.charges_enabled),
    details_submitted: Boolean(account.details_submitted),
    capabilities: (account.capabilities ?? null) as unknown as Record<string, unknown> | null,
    requirements: (account.requirements ?? null) as unknown as Record<string, unknown> | null,
    default_currency: account.default_currency ?? null,
  };
}

void ONBOARDING_TIMEOUT_MS; // reserved for future timeout config
