import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/social/token-crypto";
import { VALID_PLATFORMS } from "@/lib/social/platform-constraints";
import { apiError, E_NOT_AVAILABLE_IN_PRODUCTION } from "@/lib/api-errors";

export async function POST(request: Request) {
  // Guard: development only
  if (process.env.NODE_ENV !== "development") {
    return apiError(E_NOT_AVAILABLE_IN_PRODUCTION, 404);
  }
  if (process.env.SOCIAL_MOCK_MODE !== "true") {
    return apiError(E_NOT_AVAILABLE_IN_PRODUCTION, 404);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const platform = url.searchParams.get("platform");

  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const userId = body.userId;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "connect" && platform && VALID_PLATFORMS.includes(platform)) {
    const fakeToken = encryptToken(`mock-token-${platform}-${Date.now()}`);
    await admin
      .from("social_connections" as never)
      .upsert(
        {
          user_id: userId,
          platform,
          access_token_enc: fakeToken,
          platform_username: `mock_${platform}_user`,
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );

    return NextResponse.json({ ok: true, action: "connect", platform });
  }

  if (action === "publish") {
    const campaignId = body.campaignId ?? url.searchParams.get("campaignId");
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    }

    const { data: job } = await admin
      .from("ai_jobs" as never)
      .insert({
        user_id: userId,
        kind: "social_publish",
        status: "completed",
        progress: 100,
        input: { campaignId, bookId: "mock-book", platforms: ["x", "email"] },
        output: {
          results: {
            x: { status: "ok", postId: `mock-${Date.now()}` },
            email: { status: "ok", messageId: `mock-msg-${Date.now()}` },
          },
        },
      })
      .select("id")
      .single();

    return NextResponse.json({ ok: true, action: "publish", jobId: (job as { id: string } | null)?.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
