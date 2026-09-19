import { NextResponse } from "next/server";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/api-errors";
import { inviteBetaRecipient, listBetaRecipients, type BetaInvitationSource } from "@/lib/admin/beta-invitations";

export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;
  const page = Math.max(1, Math.min(1000, Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1)));
  try {
    return NextResponse.json(await listBetaRecipients(createAdminClient(), page));
  } catch {
    console.error("[beta invitations] recipient list unavailable");
    return NextResponse.json({ error: "Could not load invitations or today's allowance. Please retry." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireAdminRoleForApi();
  if (response || !user) return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!isValidUuid(body?.id) || !["author_waitlist", "reader_waitlist", "user"].includes(body?.source)) {
    return NextResponse.json({ error: "Select a valid invitation recipient." }, { status: 400 });
  }
  try {
    // Deliberately ignore caller-supplied email, role, and accountExists fields.
    return NextResponse.json(await inviteBetaRecipient(createAdminClient(), user.id, { id: body.id, source: body.source as BetaInvitationSource }));
  } catch (error) {
    console.error("[beta invitations] access preparation failed", { source: body.source, id: body.id });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare this invitation. Please retry." }, { status: 503 });
  }
}
