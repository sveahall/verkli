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
    // "Not authenticated" → 401; any other rejection (role restriction) → 403
    const isAuthError = result.error === "Not authenticated";
    return apiError(
      isAuthError ? E_NOT_AUTHENTICATED : E_FORBIDDEN,
      isAuthError ? 401 : 403,
    );
  }

  return NextResponse.json({ ok: true });
}
