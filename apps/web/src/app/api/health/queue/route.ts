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
    return NextResponse.json(
      {
        translationQueue: false,
        redis: false,
        message: "Redis is unavailable. Start Redis to enable translation queue.",
      },
      { status: 200 }
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
      { status: 200 }
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
      { status: 200 }
    );
  }
}
