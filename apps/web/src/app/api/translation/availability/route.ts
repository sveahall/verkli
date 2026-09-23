import { reviewedTranslationActivationReady } from "@/lib/translation-commit";
import { isTranslationsEnabled } from "@/lib/flags";
import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { checkRedisHealth } from "@/lib/health/checks";
import { getTranslationQueue } from "@/lib/translation-queue";

export async function GET() {
  const { response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!isTranslationsEnabled() || !reviewedTranslationActivationReady()) {
    return NextResponse.json({ available: false });
  }

  const redis = await checkRedisHealth();
  if (!redis) {
    return NextResponse.json({ available: false });
  }

  const queue = getTranslationQueue();
  if (!queue) {
    return NextResponse.json({ available: false });
  }

  try {
    await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json({ available: false });
  }
}
