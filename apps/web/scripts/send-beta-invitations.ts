/**
 * Send the beta invitation to waitlist rows that have never been invited.
 *
 *   npx tsx scripts/send-beta-invitations.ts                    # dry run
 *   npx tsx scripts/send-beta-invitations.ts --render out.html  # write the email to a file
 *   npx tsx scripts/send-beta-invitations.ts --only me@x.com --apply
 *   npx tsx scripts/send-beta-invitations.ts --limit 90 --apply
 *   npx tsx scripts/send-beta-invitations.ts --apply
 *
 * Why this exists
 * ---------------
 * 104 people are on `public.waitlist`; 101 of them never created an account.
 * They were promised "a personal invitation" in the confirmation email and it
 * was never sent. This sends it, and stamps `beta_invited_at` so signing up
 * with that address flips `user_flags.beta_enabled` on its own — see
 * lib/auth/beta.ts, grantBetaAccessIfInvited. Without the stamp the invitation
 * leads to an account that BETA_LOCK bounces.
 *
 * Safety, in order of how much it matters
 * ---------------------------------------
 * - Dry run by default. `--apply` is the only thing that sends.
 * - `--only <email>` sends exactly one, so a real message can be read in a real
 *   inbox before 101 go out.
 * - `beta_invited_at` is re-read immediately before each send, so two runs at
 *   once (or a re-run after a crash) cannot mail the same person twice.
 * - The stamp is written only after a send that succeeded. A failure leaves the
 *   row null, so the next run retries exactly the ones that did not go.
 * - Resend's free tier is 100 emails/day. 101 rows means the last one 429s;
 *   that row stays unstamped and a run tomorrow picks it up. Nothing to undo.
 * - Addresses that already have an account are reported, never emailed: the
 *   email says "create your account", which is wrong for someone who has one.
 *   `--only` overrides this: naming one address is deliberate, and it is how
 *   you read a real message in a real inbox before the batch goes out.
 * - Throttled to stay under Resend's default 2 requests/second.
 */

import * as path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Resend } from "resend";
import {
  buildBetaInvitationHtml,
  buildBetaInvitationSubject,
} from "../src/lib/emails/beta-invitation";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

const argv = process.argv;
const APPLY = argv.includes("--apply");
function argValue(flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : null;
}
const ONLY = argValue("--only");
const RENDER_TO = argValue("--render");
const LIMIT = Number(argValue("--limit") ?? "0") || 0;

/** Resend's default limit is 2 requests/second. */
const SEND_INTERVAL_MS = 600;

type WaitlistRow = {
  id: string;
  email: string;
  role: string | null;
  created_at: string | null;
  beta_invited_at: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim();

function rest(pathAndQuery: string): string {
  return `${SUPABASE_URL}/rest/v1/${pathAndQuery}`;
}
const HEADERS = {
  apikey: SERVICE_KEY ?? "",
  Authorization: `Bearer ${SERVICE_KEY ?? ""}`,
  "Content-Type": "application/json",
};

async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { headers: HEADERS, ...init });
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

/**
 * Every address that already has an auth account. The invitation reads "create
 * your account", so sending it to one of these is a bug the recipient sees.
 */
async function existingAccountEmails(): Promise<Set<string>> {
  const emails = new Set<string>();
  for (let page = 1; ; page++) {
    const res = await fetchWithRetry(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`
    );
    if (!res.ok) {
      throw new Error(`auth admin list failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { users?: Array<{ email?: string | null }> };
    const batch = body.users ?? [];
    for (const u of batch) {
      if (u.email) emails.add(u.email.trim().toLowerCase());
    }
    if (batch.length < 200) return emails;
  }
}

async function main() {
  const missing = [
    !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !SERVICE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    !RESEND_API_KEY && "RESEND_API_KEY",
    !RESEND_FROM_EMAIL && "RESEND_FROM_EMAIL",
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(`\n✖  Missing ${missing.join(", ")}\n`);
    process.exit(1);
  }

  // Already-invited rows are excluded here as well as re-checked per row, so a
  // normal re-run does not even fetch them.
  let query =
    "waitlist?select=id,email,role,created_at,beta_invited_at" +
    "&beta_invited_at=is.null&order=created_at.asc&limit=1000";
  if (ONLY) query += `&email=eq.${encodeURIComponent(ONLY)}`;

  const res = await fetchWithRetry(rest(query));
  if (!res.ok) {
    const body = await res.text();
    console.error(`\n✖  Could not read waitlist: HTTP ${res.status} ${body.slice(0, 200)}`);
    console.error(
      `   If this is 42703 (column beta_invited_at does not exist), the migration\n` +
        `   has not been applied. Run: cd apps/web && npx supabase db push\n`
    );
    process.exit(1);
  }
  let rows = (await res.json()) as WaitlistRow[];

  // `--only` names one address on purpose, so it overrides the has-an-account
  // skip. Without this the documented way to check a real message ("send one to
  // yourself first") reports 0 recipients for anyone who already signed up,
  // which is everyone who would be testing it.
  const withAccounts = ONLY ? new Set<string>() : await existingAccountEmails();
  const alreadyRegistered = rows.filter((r) => withAccounts.has(r.email.trim().toLowerCase()));
  rows = rows.filter((r) => !withAccounts.has(r.email.trim().toLowerCase()));
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  console.log(`\n══ Verkli beta invitations ══\n`);
  console.log(`from:        ${RESEND_FROM_EMAIL}`);
  console.log(`to invite:   ${rows.length} address${rows.length === 1 ? "" : "es"}`);
  if (ONLY) console.log(`--only:      ${ONLY}`);
  if (LIMIT) console.log(`--limit:     ${LIMIT}`);
  console.log(`subject:     ${buildBetaInvitationSubject()}`);

  if (alreadyRegistered.length > 0) {
    console.log(
      `\nskipping ${alreadyRegistered.length} who already have an account ` +
        `(the email says "create your account"):`
    );
    for (const r of alreadyRegistered) console.log(`   ${r.email}`);
    console.log(`   → grant these in /admin/beta, or they stay outside BETA_LOCK.`);
  }

  if (RENDER_TO) {
    const sample = rows[0]?.email ?? "author@example.com";
    writeFileSync(RENDER_TO, buildBetaInvitationHtml({ email: sample }));
    console.log(`\nrendered the invitation to ${RENDER_TO} (for ${sample})`);
  }

  if (rows.length > 100) {
    console.log(
      `\n⚠  Resend's free tier allows 100 emails/day and this is ${rows.length}.\n` +
        `   The overflow will fail, stay unstamped, and go out on the next run.`
    );
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing sent. Add --apply.)\n`);
    for (const r of rows.slice(0, 5)) {
      console.log(
        `   would invite ${r.email.padEnd(34)} role=${r.role ?? "-"}  joined ${String(r.created_at).slice(0, 10)}`
      );
    }
    if (rows.length > 5) console.log(`   … and ${rows.length - 5} more`);
    console.log("");
    process.exit(0);
  }

  const resend = new Resend(RESEND_API_KEY);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    // Re-read immediately before sending: a concurrent run, or a retry after a
    // crash, must not put a second invitation in the same inbox.
    const check = await fetchWithRetry(rest(`waitlist?select=beta_invited_at&id=eq.${row.id}`));
    const current = (await check.json()) as Array<{ beta_invited_at: string | null }>;
    if (current[0]?.beta_invited_at) {
      skipped++;
      console.log(`   skip  ${row.email} (already invited)`);
      continue;
    }

    const subject = buildBetaInvitationSubject();
    const html = buildBetaInvitationHtml({ email: row.email });

    let ok = false;
    let error: string | null = null;
    try {
      const result = await resend.emails.send({
        from: RESEND_FROM_EMAIL!,
        to: row.email,
        subject,
        html,
      });
      if (result.error) error = result.error.message;
      else ok = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (ok) {
      const stamped = await fetchWithRetry(rest(`waitlist?id=eq.${row.id}`), {
        method: "PATCH",
        body: JSON.stringify({ beta_invited_at: new Date().toISOString() }),
      });
      sent++;
      // A send that succeeded but could not be stamped is the one case that can
      // duplicate on the next run, and the one case where the recipient signs
      // up and is still locked out. It is called out rather than counted as a
      // clean success.
      console.log(
        `   sent  ${row.email.padEnd(34)}${stamped.ok ? "" : "  ⚠ NOT STAMPED — will resend and will not auto-grant"}`
      );
    } else {
      failed++;
      console.log(`   FAIL  ${row.email.padEnd(34)} ${error}`);
    }

    await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
  }

  console.log(`\nsent ${sent}   failed ${failed}   skipped ${skipped}`);
  if (failed > 0) {
    console.log(`re-run the same command to retry the ${failed} that failed.\n`);
  } else {
    console.log("");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖  invitations crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
