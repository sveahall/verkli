import type { User } from "@supabase/supabase-js";

/**
 * The caller's email address, but only once Supabase has confirmed they control it.
 *
 * Use this anywhere an email address is the KEY to something that already
 * exists — looking up a Stripe customer, adopting a subscription, matching an
 * order. An unconfirmed address is a claim, not an identity: if signup ever
 * issues a session before confirmation, `user.email` is attacker-chosen, and an
 * email-keyed lookup hands them whatever belongs to that address.
 *
 * Today the confirmation link gates both signup flows, so there is no live
 * path — but that guarantee lives in a Supabase dashboard toggle, not in this
 * repo, and nothing here would notice if it were switched off.
 *
 * Do NOT use this for creating a record that will belong to the caller (a new
 * Stripe customer, a receipt address). There the address is data about them,
 * not a key to someone else's row, and withholding it only loses information.
 *
 * `email_confirmed_at` is the ONLY field consulted, deliberately. A previous
 * version also accepted `confirmed_at` as a fallback "for sessions minted
 * before email_confirmed_at existed" — but in GoTrue `auth.users.confirmed_at`
 * is a generated column over `LEAST(email_confirmed_at, phone_confirmed_at)`,
 * and Postgres `LEAST` ignores NULLs. A phone-confirmed user with an
 * unconfirmed email therefore has `confirmed_at` set and `email_confirmed_at`
 * NULL, and the fallback returned their unproven address — which then flows
 * into the Stripe-customer lookups in billing/portal and billing/sync, the two
 * branches that adopt an existing customer's subscription. A phone
 * confirmation proves nothing about the email, so it cannot gate an
 * email-keyed lookup.
 */
export function getConfirmedEmail(user: User | null | undefined): string | null {
  if (!user) return null;
  if (!user.email_confirmed_at) return null;
  const email = (user.email ?? "").trim();
  return email.length > 0 ? email : null;
}
