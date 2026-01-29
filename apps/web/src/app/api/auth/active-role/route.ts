import { NextResponse } from "next/server";
import { updateActiveRole, type ActiveRole } from "@/features/auth/roles";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const role = body?.role as ActiveRole | undefined;

    if (role !== "writer" && role !== "reader") {
      return NextResponse.json({ ok: false, message: "Invalid role" }, { status: 400 });
    }

    const result = await updateActiveRole(role);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Failed to update role" }, { status: 500 });
  }
}
