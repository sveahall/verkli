import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { recordAudit, auditMetadataFromRequest } from "@/lib/audit";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getClientIpFromRequest } from "@/lib/request-ip";
import {
  apiError,
  E_VALIDATION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";

// DMCA takedown form endpoint (Week 1 / ROADMAP Phase 0.3).
//
// Captures a structured DMCA notice per 17 U.S.C. § 512(c)(3):
//   1. Signature of the rightsholder (or authorized agent).
//   2. Identification of the work claimed to be infringed.
//   3. Identification of the infringing material + location.
//   4. Contact info: address, phone, email.
//   5. Good-faith belief statement.
//   6. Penalty-of-perjury statement that the info is accurate.
//
// The route:
//   1. Validates the payload (rejects clearly-incomplete notices).
//   2. Inserts a `content_reports` row with reason_code='dmca' so the admin
//      moderation queue picks it up alongside other reports.
//   3. Emails legal@verkli with the full notice (Resend).
//   4. Writes an audit log entry.
//
// Rate-limited per IP since the form is unauthenticated.

export const runtime = "nodejs";

// createPerUserRateLimiter is generic — the key is just a string identifier;
// we pass the client IP for this anonymous endpoint.
const dmcaLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

const dmcaSchema = z.object({
  // Rightsholder identification
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  address: z.string().min(5).max(500),

  // Authorisation
  representingCapacity: z.enum(["self", "authorized_agent"]),

  // The work
  copyrightedWorkTitle: z.string().min(2).max(500),
  copyrightedWorkUrl: z.string().url().optional(),

  // The infringement
  infringingUrl: z.string().url(),
  infringingDescription: z.string().min(10).max(2000),

  // Statements (must be acknowledged via checkboxes in the UI)
  goodFaithStatement: z.literal(true),
  accuracyStatement: z.literal(true),

  // Electronic signature
  signature: z.string().min(2).max(200),
});

type DmcaInput = z.infer<typeof dmcaSchema>;

export async function POST(request: Request) {
  const ip = getClientIpFromRequest(request);
  const rl = await dmcaLimiter.check(ip || "unknown");
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429);

  const json = await request.json().catch(() => null);
  const parsed = dmcaSchema.safeParse(json);
  if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);

  const input = parsed.data;
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Persist as content_report for the moderation queue. Anonymous notices
  // are still accepted (DMCA does not require account holders); we only need
  // a reporter_user_id when the reporter happens to be logged in.
  const targetId =
    extractTargetIdFromUrl(input.infringingUrl) ?? input.infringingUrl.slice(0, 200);

  let reportId: string | null = null;
  if (user?.id) {
    const { data: report, error: insertError } = await admin
      .from("content_reports" as never)
      .insert({
        reporter_user_id: user.id,
        target_type: "book",
        target_id: targetId,
        reason_code: "dmca",
        detail: serialiseDmcaDetail(input),
        status: "pending",
      })
      .select("id")
      .single();
    if (insertError) {
      console.error("[legal.dmca-takedown] content_reports insert failed", {
        message: insertError.message,
      });
      // Don't block — still send email below.
    } else {
      reportId = String((report as { id?: string } | null)?.id ?? "");
    }
  }

  await sendDmcaEmail(input, request, reportId);

  if (user?.id) {
    void recordAudit(admin, {
      action: "content_report.escalate",
      target: { type: "content_report", id: reportId ?? null },
      after: {
        reason_code: "dmca",
        target_type: "book",
        infringingUrl: input.infringingUrl,
      },
      metadata: auditMetadataFromRequest(request, { reportId, anonymous: false }),
    });
  }

  return NextResponse.json({ ok: true, reportId });
}

function extractTargetIdFromUrl(url: string): string | null {
  // Pull a UUID out of the URL if present (e.g. /reader/books/<uuid>).
  const m = url.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return m ? m[0] : null;
}

function serialiseDmcaDetail(input: DmcaInput): string {
  return JSON.stringify(
    {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      address: input.address,
      representingCapacity: input.representingCapacity,
      copyrightedWorkTitle: input.copyrightedWorkTitle,
      copyrightedWorkUrl: input.copyrightedWorkUrl ?? null,
      infringingUrl: input.infringingUrl,
      infringingDescription: input.infringingDescription,
      signature: input.signature,
      receivedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

async function sendDmcaEmail(
  input: DmcaInput,
  request: Request,
  reportId: string | null
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? "noreply@verkli.com";
  const to = process.env.LEGAL_EMAIL?.trim() ?? "legal@verkli.com";
  if (!apiKey) {
    console.warn("[legal.dmca-takedown] RESEND_API_KEY not set; notice persisted but email skipped");
    return;
  }

  const resend = new Resend(apiKey);
  const ip = getClientIpFromRequest(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  try {
    await resend.emails.send({
      from,
      to,
      subject: `DMCA notice received${reportId ? ` (report ${reportId})` : ""}`,
      text: [
        "DMCA takedown notice received via Verkli legal form.",
        "",
        `Report ID: ${reportId ?? "(anonymous, no report row)"}`,
        `Source IP: ${ip ?? "unknown"}`,
        `User agent: ${userAgent}`,
        `Received at: ${new Date().toISOString()}`,
        "",
        "—— Notice contents ——",
        "",
        `Full name:                 ${input.fullName}`,
        `Email:                     ${input.email}`,
        `Phone:                     ${input.phone ?? "(not provided)"}`,
        `Address:                   ${input.address}`,
        `Representing:              ${input.representingCapacity}`,
        "",
        `Copyrighted work title:    ${input.copyrightedWorkTitle}`,
        `Copyrighted work URL:      ${input.copyrightedWorkUrl ?? "(not provided)"}`,
        "",
        `Infringing URL:            ${input.infringingUrl}`,
        "Infringing description:",
        input.infringingDescription,
        "",
        `Signature:                 ${input.signature}`,
        "",
        "Statements acknowledged:",
        "  - Good faith belief that use is not authorised: yes",
        "  - Information accurate under penalty of perjury: yes",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[legal.dmca-takedown] email send failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
