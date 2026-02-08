import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";
import {
  apiError,
  E_INVALID_ROLE,
  E_NOT_AUTHENTICATED,
  E_FORBIDDEN,
} from "@/lib/api-errors";
import { NextResponse } from "next/server";

const VALID_ROLES: ActiveRole[] = ["author", "reader"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as ActiveRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return apiError(E_INVALID_ROLE, 400);
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
    // Return 403 for role restriction, 401 for auth issues
    const status = result.error?.includes("Reader accounts") ? 403 : 401;
    const key = status === 403 ? E_FORBIDDEN : E_NOT_AUTHENTICATED;
    return apiError(key, status);
  }

  return NextResponse.json({ ok: true });
}
