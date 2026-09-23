# Private illustration candidates — I2a

This separate change adds a private candidate register using existing `content_assets` columns and the existing `content-assets` bucket. It does not insert images into chapter text. I1, recovery packages, schemas, policies, dependencies and editor/chapter-save code are unchanged.

## Scope and routes

- Author UI: `/author/books/{bookId}/editions/{editionId}/chapters/{chapterId}/illustrations`. There is no new editor navigation or manuscript mutation.
- API: `/api/books/{bookId}/editions/{editionId}/chapters/{chapterId}/illustrations` (GET/POST), and `/{assetId}/image` (GET).
- POST contains exactly two multipart parts: `intent` (strict JSON, at most 8 KiB) and `file` (PNG/JPEG, at most 10 MiB). Intent contains requestId, expectedChapterVersion, alt, placement and styleSnapshot. Route IDs and the authenticated owner define scope.
- Development demo: `http://localhost:3072/dev/illustration-candidates`. It uses memory and local object URLs only. Page reload clears it. It is hidden outside development.

The production adapter is separate from the memory fixture and the frozen I1 adapter. Account, book, edition and chapter identify a panelsession. Switching context unmounts local resources and ignores late results; cancelling a browser request does not promise to cancel a server commit.

## Storage contract and limits

The server verifies active book ownership, edition membership and active chapter membership before accessing private storage. Every operation performs a read-only required-column probe and requires the bucket to report `public === false`; unknown/missing/public storage returns 503. No policies or buckets are automatically changed. Storage paths are rebuilt from verified scope, candidate UUID and the server-calculated file hash. Mutable row metadata is validated against that path; neither public nor signed URLs are returned.

Sharp fully decodes pixels with a 40 MP input limit and 20,000 pixel side limit. MIME must match PNG/JPEG bytes; PNG animation control is rejected even when the decoder sees only one frame. The body reader bounds streamed data independently of Content-Length. Image responses recheck scope after download and use private/no-store, Vary: Cookie and nosniff headers. Existing application middleware supplies same-origin CSRF checks.

Saves reserve a new pending row, upload with upsert:false, verify stored bytes, recheck the source chapter version, conditionally complete the row and read back the result. The same request UUID and identical intent reconcile uncertain outcomes. Version collisions retry at most three times within the existing book/image/generic sequence. Previous completed images are not overwritten or deleted. A changed source version returns 409; the UI retains the proposal and provides an explicit action to review against the current text version before a new request.

This is not an atomic Storage/database transaction or immutable history. A pending object can remain after failure. A chapter can change after the last version check; the list returns the current version and the UI labels older sources. Existing owner policies can still allow direct row/object changes. Cleanup, immutable retention, R1 writefences, locked style profiles, AI generation, manuscript integration and print export remain separate work.

Source audit found the existing generic `api/books/[id]/content/route.ts` as the other application reader of content_assets, without an in-repo consumer found for its endpoint. That endpoint is unchanged and can include these generic image rows; external callers must honor config.feature/metadata.source rather than labelling all images as AI outputs.

## Local QA (synthetic data only)

Start with public dummy config, never a production environment file:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon NEXT_PUBLIC_WAITLIST_ONLY=false NEXT_PUBLIC_SITE_URL=http://localhost:3072 npm run dev -w @verkli/web -- --port 3072
```

1. Open the development demo, dismiss the cookie banner, and verify the explicit simulated-saving notice and empty candidates list.
2. Choose a synthetic PNG/JPEG, add alternative text, placement, style name, medium and palette. Save and verify the image and “Not inserted into manuscript” copy.
3. Change alternative text, click Fail next save and save. Check that the first candidate and local proposal remain. Retry and verify the second candidate appears once.
4. Click Advance text version and Reload candidates. Verify older-source warnings, then Use current text version and save after review.
5. Enable Delay saves, save another proposal and immediately switch Demo chapter. Verify the old response never appears in the new chapter; switching back can show the old chapter's completed candidate.
6. Repeat at 390 px width. Check inputs, errors, buttons and saved images without horizontal scrolling. Reload the whole page and verify demo state clears.

## Verification boundary

Targeted Vitest tests cover service, actual image decoding, transport limits, authorization order, relational repository queries, readiness, privacy headers, retries and client adapter validation. Playwright tests cover the memory-backed UI on desktop and mobile. These are not evidence of live persistence or deployed policy parity.

Full workspace lint/test/build, fresh full TypeScript and actual production-server 404 verification use the shared release-owner queue. Before any activation, separately authorize and perform read-only live schema/bucket/policy verification and approved integration tests; no live database, storage or provider writes were made during implementation.
