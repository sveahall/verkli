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
  E_RATE_LIMIT_EXCEEDED,
  E_APPLICATION_UPDATE_FAILED,
  E_APPLICATION_SUBMIT_FAILED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const applicationLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

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

  // SECURITY: Only trust profiles.role — user_metadata is client-writable.
  const profileRole = profile?.role ?? null;

  if (isLegacyAuthorRole(profileRole)) {
    return NextResponse.json({ status: "approved" });
  }

  const status = await getAuthorApplicationStatus(supabase, user.id);
  return NextResponse.json({ status: status ?? "none" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await applicationLimiter.check(user.id);
  if (!rl.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // SECURITY: Only trust profiles.role — user_metadata is client-writable.
  const profileRole = profile?.role ?? null;

  if (isLegacyAuthorRole(profileRole)) {
    return NextResponse.json({ ok: true, status: "approved", alreadyApproved: true });
  }

  const body = await request.json().catch(() => null);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const hasPublishedBefore = typeof body?.hasPublishedBefore === "boolean" ? body.hasPublishedBefore : null;
  const publishedBooksUrl = typeof body?.publishedBooksUrl === "string" ? body.publishedBooksUrl.trim() : null;

  const admin = createAdminClient();
  const currentStatus = await getAuthorApplicationStatus(admin, user.id);

  if (currentStatus === "pending") {
    return NextResponse.json({ ok: true, status: "pending", alreadyPending: true });
  }

  if (currentStatus === "approved") {
    return NextResponse.json({ ok: true, status: "approved", alreadyApproved: true });
  }

  const applicationData = {
    first_name: firstName || null,
    last_name: lastName || null,
    email: email || null,
    has_published_before: hasPublishedBefore,
    published_books_url: publishedBooksUrl || null,
  };

  if (currentStatus === "rejected") {
    const { error } = await admin
      .from("author_applications" as never)
      .update({ status: "pending", ...applicationData } as never)
      .eq("user_id", user.id);

    if (error) {
      return apiError(E_APPLICATION_UPDATE_FAILED, 500);
    }

    return NextResponse.json({ ok: true, status: "pending", reapplied: true });
  }

  const { error } = await admin
    .from("author_applications" as never)
    .insert({ user_id: user.id, status: "pending", ...applicationData } as never);

  if (error) {
    return apiError(E_APPLICATION_SUBMIT_FAILED, 500);
  }

  return NextResponse.json({ ok: true, status: "pending" });
}
