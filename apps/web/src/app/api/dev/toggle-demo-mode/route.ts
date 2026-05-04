import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev-only endpoint to flip the current user's `profiles.demo_mode` flag.
 * Lets a logged-in developer see the investor-pitch Production-façade
 * without switching to the demo author account.
 *
 * Hardened against accidental production exposure with three layers:
 *   1. NODE_ENV must be "development".
 *   2. The request hostname must be localhost / 127.0.0.1.
 *   3. The user must be authenticated via the normal Supabase session.
 *
 * Failing any of those returns 404 — same shape as a missing route — so
 * a curious prober on a deployed environment learns nothing.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  if (!isLocal) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupErr } = await admin
    .from("profiles")
    .select("demo_mode")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { ok: false, error: lookupErr.message },
      { status: 500 }
    );
  }

  const previous = Boolean(
    (existing as { demo_mode?: boolean | null } | null)?.demo_mode
  );
  const next = !previous;

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ demo_mode: next })
    .eq("user_id", user.id);
  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, demo_mode: next });
}
