import { NextResponse } from "next/server";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";

const startedAt = new Date().toISOString();

export async function GET() {
  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()]);

  const body = {
    app: true,
    db,
    redis,
    startedAt,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  };

  return NextResponse.json(body, { status: db && redis ? 200 : 500 });
}
