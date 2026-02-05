import { NextResponse } from "next/server";
import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";

const VALID_ROLES: ActiveRole[] = ["author", "reader"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as ActiveRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
    // Return 403 for role restriction, 401 for auth issues
    const status = result.error?.includes("Reader accounts") ? 403 : 401;
    return NextResponse.json({ error: result.error ?? "Not authenticated" }, { status });
  }

  return NextResponse.json({ ok: true });
}
