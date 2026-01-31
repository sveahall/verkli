import { NextResponse } from "next/server";
import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";
import { SOFT_DENIAL_COPY } from "@/lib/copy-rules";

const VALID_ROLES: ActiveRole[] = ["author", "reader"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as ActiveRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: SOFT_DENIAL_COPY.ACTION_NOT_PERMITTED }, { status: 400 });
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
    return NextResponse.json({ error: SOFT_DENIAL_COPY.ACCESS_RESTRICTED }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
