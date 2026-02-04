import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTtsStorageBucket } from "@/lib/tts/storage";

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.slice(0, 8)}…${u.hostname.slice(-4)}`;
  } catch {
    return "(invalid)";
  }
}

/**
 * Dev-only debug endpoint for TTS/Storage.
 * Returns bucket name, masked Supabase URL, env presence, and bucket reachability.
 * Does not leak secrets.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const hasUrl = Boolean(url);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const bucket = getTtsStorageBucket();

  let bucketReachable: boolean | string = false;
  if (hasUrl && hasServiceKey) {
    try {
      const admin = createAdminClient();
      const { data: buckets, error } = await admin.storage.listBuckets();
      if (!error && buckets?.some((b) => b.name === bucket)) {
        bucketReachable = true;
      } else if (error) {
        bucketReachable = String(error.message ?? error).slice(0, 120);
      }
    } catch (err) {
      bucketReachable =
        err instanceof Error ? String(err.message).slice(0, 120) : "unknown error";
    }
  }

  return NextResponse.json({
    bucket,
    supabaseUrl: hasUrl ? maskUrl(url) : null,
    hasUrl,
    hasServiceKey,
    bucketReachable,
  });
}
