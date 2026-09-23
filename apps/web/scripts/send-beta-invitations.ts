/**
 * Beta welcome operator tool. Dry-run by default; sends only an explicitly
 * selected waitlist address through the same access, quota and delivery ledger
 * as /admin/beta. Never bypass these guards with a direct provider call.
 *
 * npx tsx scripts/send-beta-invitations.ts
 * npx tsx scripts/send-beta-invitations.ts --only tester@example.com --apply
 * npx tsx scripts/send-beta-invitations.ts --render /tmp/beta-welcome.html
 */
import * as path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { buildBetaInvitationHtml } from "../src/lib/emails/beta-invitation";
import { inviteBetaRecipient } from "../src/lib/admin/beta-invitations";

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
  const apply = process.argv.includes("--apply");
  const only = argValue("--only")?.trim().toLowerCase();
  const render = argValue("--render");
  if (apply && !only) throw new Error("Sending requires --only <email>. Use /admin/beta to select and review each recipient.");
  if (render) {
    writeFileSync(render, buildBetaInvitationHtml({ email: only ?? "author@example.com" }));
    console.log(`Preview written to ${render}.`);
    if (!apply) return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let query = admin.from("waitlist").select("id,email,beta_invited_at").order("created_at", { ascending: true }).limit(20);
  if (only) query = query.ilike("email", only.replace(/[%_\\]/g, "\\$&"));
  const { data, error } = await query;
  if (error) throw new Error("Waitlist could not be read. Nothing sent.");
  if (!apply) {
    console.log("Dry run. No access changed and no email sent. First 20 matching entries:");
    for (const row of data ?? []) console.log(`${row.email}: ${row.beta_invited_at ? "access reserved" : "waiting"}`);
    return;
  }
  if (data?.length !== 1) throw new Error("Expected exactly one matching waitlist entry. Nothing sent.");
  const result = await inviteBetaRecipient(admin, null, { id: data[0].id, source: "author_waitlist" });
  console.log(`${result.delivery.status}: ${result.delivery.message}`);
  if (!["sent", "already_sent"].includes(result.delivery.status)) process.exitCode = 1;
}
main().catch(error => {
  console.error("[beta invitations]", error instanceof Error ? error.message : "Invitation failed.");
  process.exitCode = 1;
});
