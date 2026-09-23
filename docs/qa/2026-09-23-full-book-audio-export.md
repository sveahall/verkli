# Full-book audio export — local verification

## User QA (six steps)

1. Open `http://127.0.0.1:3250/dev/full-book-audio-export`. Confirm the synthetic-only notice, 21 verified chapters and visible technical capacity.
2. Choose MP3 128, MP3 320 or M4B and prepare an export. Reload while it runs: the same saved job should remain visible.
3. Download the completed file. The fixture lasts 378 seconds; M4B contains 21 chapter markers spaced 18 seconds apart. The first, middle and last tones differ.
4. Start another export and cancel it. Reload and confirm cancelled status with no download link.
5. Select encoder-error, source-changed, missing or denied. No failed/unverified export should expose a download. Reload source/status remains available.
6. At 390px width, check controls and saved jobs fit. In the source-recovery browser probe, an old job remains cancellable after current chapter audio becomes unavailable.

## Scope and implementation

The author UI is `/author/books/<bookId>/audiobook/full-export?editionId=<editionId>`. It calls the matching author API. Runtime activation requires `AUDIOBOOK_FULL_EXPORT_ENABLED=true`; this work did not set the flag or run any real job. The existing bounded synchronous export remains unchanged by default.

Jobs use existing `ai_jobs` with kind `audiobook_export` and a distinct BullMQ `export` action on the existing audiobook queue. The worker export branch and failure reconciliation return before speech generation, billing refunds or book-generation state. Owner, book, edition, source identity, request identity and worker attempts are checked. Compare-and-swap fences cancellation and concurrent workers. Temporary server errors remain retryable; source/identity validation errors do not silently select other audio.

Source bytes stream to an owned directory and must match their stored sizes, exact-text audio hashes and timing provenance. Encoding uses disk PCM and measured samples. The file is probed and fully decoded before upload. Storage upload is private and immutable per attempt. Status/download recheck the current owner and source; existing jobs can still be cancelled when current source audio is unavailable. Download streams verify size/hash and close upstream on cancellation.

## Capacity and deployment limits

This E3 slice supports up to 500 chapters, 128 MiB per source, 2 GiB total source, 8 GiB decoded PCM and a one-hour processing deadline. Output is capped by both the configured private bucket and 512 MiB. At constant bitrate, 512 MiB is about 3h44m at MP3 320 and 9h19m at MP3 128. Larger files require the separately planned multipart E4 slice; E3 is not unlimited export.

The existing private-bucket and service-write permissions were inspected independently through read-only metadata on 2026-09-23. This is not an actual private export test. Deployment still needs compatible ffmpeg/ffprobe binaries/codecs, sufficient writable scratch disk, the export-enabled flag and a running audiobook queue consumer.

If publication commits but its acknowledgement is lost, the worker rechecks the row and preserves its completed artifact. If that lookup is also unavailable, the private object is retained rather than deleting a possibly published file. Automatic historical-attempt retention cleanup remains an operational limitation.

## Evidence

- Encoder: 16 targeted tests, including real synthetic 378-second/21-chapter exports in all three formats; source bounds, cancellation/process exit, timeout and truncation.
- Browser: 11 actual fixture-flow checks, downloaded file metadata/full decode and distinct first/middle/last tone ordering. A separate four-check mocked HTTP browser probe covers source-invalid cancellation and mobile recovery.
- Job, HTTP and Supabase/queue tests cover identity, owner isolation, retries, cancellation, deleted rows, expired leases, upload/download bounds and ambiguous publication.
- Targeted lint and worker-compatible plain tsx import are checked locally. Broad lint/typecheck/suite/build are delegated to external CI per release-owner resource coordination; no local full-gate claim.

Artifacts are under `/Users/admin/Documents/Verkli/Fardigstallande-2026-09-22/ljud/full-book-export-ui/`. The audio files are synthetic tones, not narrated books. No real private assets, database/storage writes, paid provider calls or production activation were used for these proofs.
