import { NextResponse } from "next/server";
import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";
<<<<<<< HEAD
=======
import { SOFT_DENIAL_COPY } from "@/lib/copy-rules";
>>>>>>> main

const VALID_ROLES: ActiveRole[] = ["author", "reader"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = body?.role as ActiveRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
<<<<<<< HEAD
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
=======
    return NextResponse.json({ error: SOFT_DENIAL_COPY.ACTION_NOT_PERMITTED }, { status: 400 });
>>>>>>> main
  }

  const result = await updateActiveRole(role);

  if (!result.ok) {
<<<<<<< HEAD
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
=======
    return NextResponse.json({ error: SOFT_DENIAL_COPY.ACCESS_RESTRICTED }, { status: 401 });
>>>>>>> main
  }

  return NextResponse.json({ ok: true });
}
