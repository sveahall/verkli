import { NextResponse } from "next/server";
import { getTranslationQueue } from "@/lib/translation-queue";
import { checkRedisHealth } from "@/lib/health/checks";

export async function GET() {
  const redis = await checkRedisHealth();

  if (!redis) {
    return NextResponse.json(
      { translationQueue: false, redis: false },
      { status: 500 }
    );
  }

  const queue = getTranslationQueue();
  if (!queue) {
    return NextResponse.json(
      { translationQueue: false, redis: true },
      { status: 500 }
    );
  }

  try {
    await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return NextResponse.json({ translationQueue: true, redis: true });
  } catch {
    return NextResponse.json(
      { translationQueue: false, redis: true },
      { status: 500 }
    );
  }
}
