import { NextResponse } from "next/server";
import { hasAdminOrOpsAccess } from "@/lib/admin-auth";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";

const startedAt = new Date().toISOString();

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const authorized = await hasAdminOrOpsAccess(request);

  if (!authorized) {
    return NextResponse.json(
      {
        ok: true,
        timestamp,
        version,
      },
      { status: 200 }
    );
  }

  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()]);

  const body = {
    app: true,
    db,
    redis,
    startedAt,
    timestamp,
    version,
  };

  return NextResponse.json(body, { status: db && redis ? 200 : 500 });
}
