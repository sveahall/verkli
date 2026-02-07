import { NextResponse } from "next/server";
import { checkDbHealth, checkRedisHealth } from "@/lib/health/checks";

export async function GET() {
  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()]);

  const body = {
    app: true,
    db,
    redis,
  };

  return NextResponse.json(body, { status: db && redis ? 200 : 500 });
}
