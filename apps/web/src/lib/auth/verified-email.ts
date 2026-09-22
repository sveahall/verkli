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
 * `confirmed_at` is the older field and is kept as a fallback for sessions
 * minted before `email_confirmed_at` existed.
 */
export function getConfirmedEmail(user: User | null | undefined): string | null {
  if (!user) return null;
  if (!user.email_confirmed_at && !user.confirmed_at) return null;
  const email = (user.email ?? "").trim();
  return email.length > 0 ? email : null;
}
