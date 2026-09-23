/**
 * Round-one follow-up mails. Dry-run by default; grants no access.
 *
 *   applicant  beta_applications rows NOT invited (they applied, weren't picked)
 *   waitlist   author waitlist rows that never applied and were never invited
 *
 * npx tsx scripts/send-beta-followups.ts --kind applicant            # counts only
 * npx tsx scripts/send-beta-followups.ts --kind applicant --list     # show addresses
 * npx tsx scripts/send-beta-followups.ts --kind applicant --apply    # send, up to today's budget
 * npx tsx scripts/send-beta-followups.ts --kind waitlist --render /tmp/followup.html
 */
import * as path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { buildBetaFollowupHtml, type BetaFollowupKind } from "../src/lib/emails/beta-followup";
import { getSentBetaFollowups, sendBetaFollowup } from "../src/lib/emails/beta-followup-delivery";
import { selectFollowupRecipients } from "../src/lib/emails/beta-followup-recipients";
import { getBetaDeliveryStates, NO_WELCOME_RECORDED } from "../src/lib/emails/beta-delivery";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}
function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const kind = argValue("--kind");
  if (kind !== "applicant" && kind !== "waitlist") throw new Error("Pass --kind applicant or --kind waitlist.");
  const apply = process.argv.includes("--apply");
  const render = argValue("--render");
  if (render) {
    writeFileSync(render, buildBetaFollowupHtml({ kind }));
    console.log(`Preview written to ${render}.`);
    if (!apply) return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [applications, waitlist] = await Promise.all([
    admin.from("beta_applications").select("id,email,first_name,created_at").order("created_at", { ascending: true }),
    admin.from("waitlist").select("id,email,beta_invited_at,created_at").order("created_at", { ascending: true }),
  ]);
  if (applications.error || waitlist.error) throw new Error("Recipient lists could not be read. Nothing sent.");
  // Invitations sent through an existing account leave no waitlist stamp; the
  // invitation ledger is the only record of those.
  const candidates = [...new Set([...(applications.data ?? []), ...(waitlist.data ?? [])].map(r => r.email.trim().toLowerCase()))];
  const invitedEmails = new Set<string>();
  for (const audience of ["author", "reader"] as const) {
    const states = await getBetaDeliveryStates(admin, candidates.map(email => ({ email, audience, invitedAt: null })));
    candidates.forEach((email, i) => { if (states[i] !== NO_WELCOME_RECORDED) invitedEmails.add(email); });
  }
  const selection = selectFollowupRecipients(kind as BetaFollowupKind, applications.data ?? [], waitlist.data ?? [], invitedEmails);
  const sent = await getSentBetaFollowups(admin, kind, selection.recipients.map(r => r.email));
  const pending = selection.recipients.filter(r => !sent.has(r.email));

  console.log(`${kind}: ${selection.recipients.length} recipients, ${sent.size} already sent, ${pending.length} to send. ${selection.summary}`);
  if (process.argv.includes("--list")) for (const r of pending) console.log(`  ${r.email}`);
  if (!apply) { console.log("Dry run. No email sent."); return; }
  if (selection.blocker) throw new Error(`${selection.blocker} Nothing sent.`);

  const tally: Record<string, number> = {};
  for (const r of pending) {
    const result = await sendBetaFollowup(admin, { kind, entityId: r.id, email: r.email, name: r.name });
    tally[result.status] = (tally[result.status] ?? 0) + 1;
    if (result.status === "daily_limit") { console.log(result.message); break; }
    if (result.status !== "sent" && result.status !== "already_sent") console.log(`  ${result.status}: ${result.message}`);
  }
  console.log(`Done: ${JSON.stringify(tally)}. Re-running is safe; it skips everyone already sent.`);
  if (Object.keys(tally).some(s => !["sent", "already_sent", "daily_limit"].includes(s))) process.exitCode = 1;
}
main().catch(error => {
  console.error("[beta followups]", error instanceof Error ? error.message : "Follow-up failed.");
  process.exitCode = 1;
});
