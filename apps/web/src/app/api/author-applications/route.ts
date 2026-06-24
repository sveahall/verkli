import { NextResponse } from "next/server";
import { z } from "zod";
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

// Trim strings and collapse empties to null so the optional questionnaire
// columns stay nullable.
const optionalString = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

// Required free-text fields the signup UI also enforces. Validated server-side
// so a direct POST can't create a pending application with no review context.
const requiredString = z.string().trim().min(1);

// Optional, but when present must be an http(s) link — it is rendered as a
// clickable link in the admin review UI, so reject javascript:/data: schemes.
const optionalHttpUrl = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .refine(
    (value) => value === null || /^https?:\/\//i.test(value),
    "Link must start with http:// or https://"
  );

const applicationSchema = z.object({
  firstName: requiredString,
  lastName: requiredString,
  email: requiredString,
  hasPublishedBefore: z.boolean().nullish(),
  publishedBooksUrl: optionalHttpUrl.optional(),
  motivation: requiredString,
  writingBackground: requiredString,
  workSamples: optionalString.optional(),
});

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
  const parsed = applicationSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError(E_APPLICATION_SUBMIT_FAILED, 400);
  }

  const {
    firstName = null,
    lastName = null,
    email = null,
    hasPublishedBefore = null,
    publishedBooksUrl = null,
    motivation = null,
    writingBackground = null,
    workSamples = null,
  } = parsed.data;

  const admin = createAdminClient();
  const currentStatus = await getAuthorApplicationStatus(admin, user.id);

  if (currentStatus === "pending") {
    return NextResponse.json({ ok: true, status: "pending", alreadyPending: true });
  }

  if (currentStatus === "approved") {
    return NextResponse.json({ ok: true, status: "approved", alreadyApproved: true });
  }

  const applicationData = {
    first_name: firstName,
    last_name: lastName,
    email: email,
    has_published_before: hasPublishedBefore,
    published_books_url: publishedBooksUrl,
    motivation,
    writing_background: writingBackground,
    work_samples: workSamples,
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
