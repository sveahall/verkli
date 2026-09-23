import { NextResponse } from "next/server";
import { requireAdminOrOpsForApi } from "@/lib/admin-auth";
import { getTranslationQueue } from "@/lib/translation-queue";
import { checkRedisHealth } from "@/lib/health/checks";

export async function GET(request: Request) {
  const { response } = await requireAdminOrOpsForApi(request);
  if (response) return response;

  const redis = await checkRedisHealth();

  if (!redis) {
    console.warn("[health queue] Redis is unavailable.");
    // 503, not 200. An uptime monitor reads the status code, not the body, so
    // returning 200 here reported "healthy" while Redis was down — and Redis is
    // what backs every queue, every AI spend reservation in lib/workers/budget
    // and every distributed rate limiter. A green check while all spend
    // ceilings are unenforced is the most expensive lie this endpoint can tell.
    // Matches api/health/workers, which already answers 503 when degraded.
    return NextResponse.json(
      {
        translationQueue: false,
        redis: false,
        message: "Redis is unavailable. Start Redis to enable translation queue.",
      },
      { status: 503 }
    );
  }

  const queue = getTranslationQueue();
  if (!queue) {
    console.warn("[health queue] Translation queue is unavailable.");
    return NextResponse.json(
      {
        translationQueue: false,
        redis: true,
        message: "Translation queue is unavailable.",
      },
      { status: 503 }
    );
  }

  try {
    await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return NextResponse.json({ translationQueue: true, redis: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[health queue] Failed to read translation queue health.", {
      message,
    });
    return NextResponse.json(
      {
        translationQueue: false,
        redis: true,
        message: "Failed to read translation queue health.",
      },
      { status: 503 }
    );
  }
}
