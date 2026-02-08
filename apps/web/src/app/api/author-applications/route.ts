import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_APPLICATION_UPDATE_FAILED,
  E_APPLICATION_SUBMIT_FAILED,
} from "@/lib/api-errors";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRole = profile?.role ?? null;
  const metadataRole = (user.user_metadata?.role as string | undefined) ?? null;

  if (isLegacyAuthorRole(profileRole) || isLegacyAuthorRole(metadataRole)) {
    return NextResponse.json({ status: "approved" });
  }

  const status = await getAuthorApplicationStatus(supabase, user.id);
  return NextResponse.json({ status: status ?? "none" });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRole = profile?.role ?? null;
  const metadataRole = (user.user_metadata?.role as string | undefined) ?? null;

  if (isLegacyAuthorRole(profileRole) || isLegacyAuthorRole(metadataRole)) {
    return NextResponse.json({ ok: true, status: "approved", alreadyApproved: true });
  }

  const admin = createAdminClient();
  const currentStatus = await getAuthorApplicationStatus(admin, user.id);

  if (currentStatus === "pending") {
    return NextResponse.json({ ok: true, status: "pending", alreadyPending: true });
  }

  if (currentStatus === "approved") {
    return NextResponse.json({ ok: true, status: "approved", alreadyApproved: true });
  }

  if (currentStatus === "rejected") {
    const { error } = await admin
      .from("author_applications" as never)
      .update({ status: "pending" } as never)
      .eq("user_id", user.id);

    if (error) {
      return apiError(E_APPLICATION_UPDATE_FAILED, 500);
    }

    return NextResponse.json({ ok: true, status: "pending", reapplied: true });
  }

  const { error } = await admin
    .from("author_applications" as never)
    .insert({ user_id: user.id, status: "pending" } as never);

  if (error) {
    return apiError(E_APPLICATION_SUBMIT_FAILED, 500);
  }

  return NextResponse.json({ ok: true, status: "pending" });
}
