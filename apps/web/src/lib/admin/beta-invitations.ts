import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureBetaAuthorAccess, grantBetaAccess } from "../auth/beta";
import { getBetaMailAllowance, getBetaDeliveryStates, prepareBetaWelcome, sendBetaWelcome } from "../emails/beta-delivery";

type Admin = ReturnType<typeof createAdminClient>;
export type BetaInvitationSource = "author_waitlist" | "reader_waitlist" | "user";
export type BetaRecipient = { id: string; source: BetaInvitationSource; email: string; invitedAt: string | null; deliveryState?: string };

export async function listBetaRecipients(admin: Admin, page = 1) {
  const from = (page - 1) * 50;
  const [authors, readers, allowance] = await Promise.all([
    admin.from("waitlist").select("id,email,beta_invited_at", { count: "exact" }).order("created_at", { ascending: true }).range(from, from + 49),
    admin.from("reader_waitlist").select("id,email,invited_at", { count: "exact" }).order("created_at", { ascending: true }).range(from, from + 49),
    getBetaMailAllowance(admin),
  ]);
  if (authors.error || readers.error) throw new Error("Could not load the invitation lists. Please retry.");
  const recipients: BetaRecipient[] = [
    ...(authors.data ?? []).map(r => ({ id: r.id, source: "author_waitlist" as const, email: r.email, invitedAt: r.beta_invited_at })),
    ...(readers.data ?? []).map(r => ({ id: r.id, source: "reader_waitlist" as const, email: r.email, invitedAt: r.invited_at })),
  ];
  const states = await getBetaDeliveryStates(admin, recipients.map(r => ({ ...r, audience: r.source === "author_waitlist" ? "author" : "reader" })));
  recipients.forEach((r, index) => { r.deliveryState = states[index]; });
  return { recipients, allowance, page, hasMore: Math.max(authors.count ?? 0, readers.count ?? 0) > from + 50 };
}

async function findAccount(admin: Admin, email: string) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("Account lookup failed. No invitation was sent.");
    const user = data.users.find(u => u.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
  throw new Error("Account lookup limit reached. No invitation was sent.");
}

/** Caller must authorize the admin. Recipient addresses are always server-loaded. */
export async function inviteBetaRecipient(admin: Admin, actorId: string | null, target: { id: string; source: BetaInvitationSource }) {
  let email: string;
  let audience: "author" | "reader";
  let account;
  let preparation;
  if (target.source === "user") {
    const { data, error } = await admin.auth.admin.getUserById(target.id);
    if (error || !data.user?.email) throw new Error("The selected account has no available login email. No invitation was sent.");
    account = data.user;
    email = data.user.email.trim().toLowerCase();
    const profile = await admin.from("profiles").select("role").eq("user_id", target.id).maybeSingle();
    if (profile.error || !profile.data || !["reader", "author", "admin"].includes(profile.data.role ?? "")) throw new Error("Account role could not be checked. No invitation was sent.");
    audience = profile.data.role === "reader" ? "reader" : "author";
  } else {
    audience = target.source === "author_waitlist" ? "author" : "reader";
    const table = audience === "author" ? "waitlist" : "reader_waitlist";
    const record = await admin.from(table).select("email").eq("id", target.id).maybeSingle();
    if (record.error || !record.data?.email) throw new Error("The selected waitlist entry could not be found. No invitation was sent.");
    email = record.data.email.trim().toLowerCase();
    account = await findAccount(admin, email);
    if (!account && process.env.BETA_AUTOGRANT_FROM_WAITLIST === "false") throw new Error("New-account beta redemption is disabled. Enable it before inviting this person.");
    // Persist the invitation before sending: a new user can immediately redeem
    // the invitation after verifying this exact email through Supabase Auth.
    preparation = await prepareBetaWelcome(admin, { actorId, entityId: target.id, email, audience });
    const now = new Date().toISOString();
    const saved = preparation ? { data: { id: target.id }, error: null } : audience === "author"
      ? await admin.from("waitlist").update({ beta_invited_at: now }).eq("id", target.id).select("id").single()
      : await admin.from("reader_waitlist").update({ invited_at: now }).eq("id", target.id).select("id").single();
    if (saved.error || !saved.data) throw new Error("Beta access could not be reserved. No invitation was sent.");
  }
  if (target.source === "user") preparation = await prepareBetaWelcome(admin, { actorId, entityId: target.id, email, audience });
  if (account) {
    const access = audience === "author" ? await ensureBetaAuthorAccess(admin, account.id) : await grantBetaAccess(admin, account.id);
    if (!access.ok) throw new Error("Beta access could not be enabled. No invitation was sent; retry this invitation.");
  }
  const delivery = preparation ?? await sendBetaWelcome(admin, {
    actorId, entityId: target.id, email, accountExists: Boolean(account), audience,
  });
  return { accessEnabled: true, email, delivery };
}
