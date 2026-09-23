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
 * This is only a lookup filter, not proof of ownership of an external record.
 * Supabase may auto-confirm emails when confirmation is disabled. Recovery
 * must also match the record's server-written user ID to the authenticated user.
 *
 * Do NOT use this for creating a record that will belong to the caller (a new
 * Stripe customer, a receipt address). There the address is data about them,
 * not a key to someone else's row, and withholding it only loses information.
 *
 * Do not fall back to `confirmed_at`: phone verification also sets that field.
 */
export function getConfirmedEmail(user: User | null | undefined): string | null {
  if (!user) return null;
  if (!user.email_confirmed_at) return null;
  const email = (user.email ?? "").trim();
  return email.length > 0 ? email : null;
}
