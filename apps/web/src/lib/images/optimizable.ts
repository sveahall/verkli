/**
 * Whether a `next/image` src has to bypass the optimizer.
 *
 * Only `blob:` and `data:` URLs do — Next's optimizer runs server-side and
 * cannot fetch a URL that only exists in the browser's memory, so a freshly
 * previewed upload genuinely needs `unoptimized`.
 *
 * Everything else must NOT be unoptimized. `unoptimized` hands the original
 * URL straight to the browser, so a `sizes="140px"` thumbnail of a 26 MB PNG
 * cover downloads all 26 MB from Supabase Storage on every render. Nine
 * `<Image unoptimized>` call sites shared one src that is
 * `coverPreviewUrl ?? book.cover_image` — a blob URL OR a remote Supabase URL —
 * and the flag was set unconditionally for both. book_covers holds 147 MB
 * across 338 files with one 26 MB cover; the project went 147% over its 5 GB
 * egress quota with 7 monthly active users.
 *
 * Remote covers are served from the project-specific Supabase remotePattern
 * declared in next.config.ts, so optimization works without further config.
 * That host is pinned rather than wildcarded: a `**.supabase.co` pattern let
 * anyone aim the optimizer at a bucket in a Supabase project they own, which
 * is how GHSA-2xp9-vwfh-vxw4 was reachable. A cover hosted anywhere else will
 * now 400 at /_next/image — add its exact host to remotePatterns, not a wildcard.
 */
export function requiresUnoptimizedImage(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.startsWith("blob:") || src.startsWith("data:");
}
