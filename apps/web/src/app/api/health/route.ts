import { NextResponse } from "next/server";
import { hasAdminOrOpsAccess } from "@/lib/admin-auth";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";

const startedAt = new Date().toISOString();

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  // Both hosts, because this field is the only way to tell what is actually
  // running: `vercel ls` / a green Railway deploy both report success without
  // saying which commit is serving traffic. Vercel injects the first, Railway
  // the second; "local" means neither, i.e. a dev or container-local run.
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ??
    "local";
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
