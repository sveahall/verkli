import { createAdminClient } from "@/lib/supabase/admin";
import { recordUsage } from "./meter";
import type { Pipeline } from "./types";

/**
 * Records that a signed URL was handed out for an object of known size.
 *
 * This is NOT measured egress, and the admin view labels it an estimate.
 * Files are served by a 302 straight to storage, so the bytes never cross our
 * server and no middleware can count them. Streaming them through Next.js
 * would make the figure exact and move the whole audio load into Railway's
 * compute bill — the cure costing more than the disease.
 *
 * So it over-counts (a URL handed out may never be fetched) and under-counts
 * (one URL can serve many range requests). Treat it as the key for splitting
 * the real Supabase egress total between users, never as the bill itself.
 *
 * Only called on the paths where the bytes are large enough to matter —
 * audiobook playback and ebook download. Instrumenting the small JSON-sized
 * grants would add a storage round-trip for noise.
 */
export async function recordEgressGrant(args: {
  userId: string;
  bucket: string;
  path: string;
  bookId?: string | null;
  pipeline?: Pipeline;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const slash = args.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : args.path.slice(0, slash);
    const name = slash === -1 ? args.path : args.path.slice(slash + 1);

    const { data, error } = await admin.storage.from(args.bucket).list(dir, {
      limit: 1,
      search: name,
    });
    if (error) {
      console.error("[usage] egress size lookup failed", { message: error.message });
      return;
    }

    const size = (data?.[0]?.metadata as { size?: number } | null | undefined)?.size;
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return;

    await recordUsage(
      { userId: args.userId, pipeline: args.pipeline ?? "other", bookId: args.bookId ?? null },
      [
        {
          kind: "egress_grant",
          provider: "supabase",
          quantity: size,
          unit: "bytes",
          meta: { estimated: true, bucket: args.bucket, path: args.path },
        },
      ]
    );
  } catch (err) {
    // Playback must never depend on metering succeeding.
    console.error("[usage] egress record failed", err);
  }
}
