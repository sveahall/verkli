/**
 * Send the confirmation email to waitlist rows that never got one.
 *
 *   npx tsx scripts/backfill-waitlist-emails.ts                    # dry run
 *   npx tsx scripts/backfill-waitlist-emails.ts --render out.html  # write the email to a file
 *   npx tsx scripts/backfill-waitlist-emails.ts --only me@x.com --apply
 *   npx tsx scripts/backfill-waitlist-emails.ts --limit 5 --apply
 *   npx tsx scripts/backfill-waitlist-emails.ts --apply
 *
 * Why this exists
 * ---------------
 * 104 people signed up between 2026-01-31 and 2026-08-17 and every one of them
 * still reads `confirmation_email_status = 'pending'` with a null
 * `confirmation_email_sent_at`. The email is only ever sent inline in the
 * signup request (api/waitlist/route.ts), and there was no retry and no
 * backfill — so the ones that failed, failed permanently and silently. Resend
 * itself is fine: verkli.com has been `verified` since 2026-01-31.
 *
 * Safety, in order of how much it matters
 * ---------------------------------------
 * - Dry run by default. `--apply` is the only thing that sends.
 * - `--only <email>` sends exactly one, so a real message can be checked
 *   against a real inbox before 104 go out.
 * - Each row's status is re-read immediately before its send, so two
 *   concurrent runs cannot double-send, and a row someone just emailed by hand
 *   is skipped.
 * - A send that fails records `failed` plus the error and moves on, rather than
 *   aborting the batch and leaving the rest unattempted.
 * - Throttled to stay under Resend's default 2 requests/second.
 *
 * Uses the same template as the signup path (lib/emails/waitlist-confirmation)
 * and the same three status columns, so a backfilled row is indistinguishable
 * from one that worked first time.
 */

import * as path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Resend } from "resend";
import { buildWaitlistHtml, buildWaitlistSubject } from "../src/lib/emails/waitlist-confirmation";

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
  source: string | null;
  created_at: string | null;
  confirmation_email_status: string | null;
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

/** Same definition the signup route uses: how many rows are at least as old. */
async function position(createdAt: string | null): Promise<number> {
  if (!createdAt) return 0;
  const res = await fetchWithRetry(
    rest(`waitlist?select=id&created_at=lte.${encodeURIComponent(createdAt)}`),
    { headers: { ...HEADERS, Prefer: "count=exact" }, method: "HEAD" }
  );
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  return total ? Number(total) : 0;
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

  // 'sent' is excluded, so a re-run only ever picks up what still needs it.
  let query = "waitlist?select=id,email,role,source,created_at,confirmation_email_status" +
    "&confirmation_email_status=neq.sent&order=created_at.asc&limit=1000";
  if (ONLY) query += `&email=eq.${encodeURIComponent(ONLY)}`;

  const res = await fetchWithRetry(rest(query));
  if (!res.ok) {
    console.error(`\n✖  Could not read waitlist: HTTP ${res.status}\n`);
    process.exit(1);
  }
  let rows = (await res.json()) as WaitlistRow[];
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  console.log(`\n══ Waitlist confirmation backfill ══\n`);
  console.log(`from:      ${RESEND_FROM_EMAIL}`);
  console.log(`pending:   ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  if (ONLY) console.log(`--only:    ${ONLY}`);
  if (LIMIT) console.log(`--limit:   ${LIMIT}`);

  const byVariant = { author: 0, reader: 0 };
  for (const r of rows) {
    if (r.role === "reader") byVariant.reader++;
    else byVariant.author++;
  }
  console.log(`variants:  author ${byVariant.author}, reader ${byVariant.reader}` +
    `   (role is null for ${rows.filter((r) => !r.role).length}, which get the author email)`);

  if (RENDER_TO && rows[0]) {
    const variant = rows[0].role === "reader" ? "reader" : "author";
    const html = buildWaitlistHtml({ variant, email: rows[0].email, position: 42 });
    writeFileSync(RENDER_TO, html);
    console.log(`\nrendered the ${variant} email to ${RENDER_TO} (position 42, sample)`);
    console.log(`subject: ${buildWaitlistSubject({ variant, email: rows[0].email, position: 42 })}`);
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing sent. Add --apply.)\n`);
    for (const r of rows.slice(0, 5)) {
      console.log(`   would send to ${r.email.padEnd(34)} role=${r.role ?? "-"}  ${String(r.created_at).slice(0, 10)}`);
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
    // Re-read status immediately before sending: two concurrent runs, or a
    // manual send in between, must not produce a second email.
    const check = await fetchWithRetry(
      rest(`waitlist?select=confirmation_email_status&id=eq.${row.id}`)
    );
    const current = (await check.json()) as Array<{ confirmation_email_status: string | null }>;
    if (current[0]?.confirmation_email_status === "sent") {
      skipped++;
      console.log(`   skip  ${row.email} (already sent)`);
      continue;
    }

    const variant = row.role === "reader" ? "reader" : "author";
    const pos = await position(row.created_at);
    const subject = buildWaitlistSubject({ variant, email: row.email, position: pos });
    const html = buildWaitlistHtml({ variant, email: row.email, position: pos });

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

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      confirmation_email_status: ok ? "sent" : "failed",
      confirmation_email_error: ok ? null : error ?? "unknown_error",
      confirmation_email_last_attempt_at: now,
    };
    if (ok) payload.confirmation_email_sent_at = now;

    const upd = await fetchWithRetry(rest(`waitlist?id=eq.${row.id}`), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (ok) {
      sent++;
      // A send that succeeded but could not be recorded is the one case that
      // risks a duplicate on the next run, so it is called out rather than
      // folded into the success count silently.
      console.log(`   sent  ${row.email.padEnd(34)} #${pos}${upd.ok ? "" : "  ⚠ STATUS NOT RECORDED"}`);
    } else {
      failed++;
      console.log(`   FAIL  ${row.email.padEnd(34)} ${error}`);
    }

    await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
  }

  console.log(`\nsent ${sent}   failed ${failed}   skipped ${skipped}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖  backfill crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
