# Multipart audiobook export

## Local QA (six steps)

1. In this checkout, start the development server on the allocated test port: `npm run dev -w @verkli/web -- --hostname 127.0.0.1 --port 3250`. Coordinate the shared UI test slot before starting it. Open `/dev/full-book-audio-export`.
2. Confirm the synthetic notice explicitly identifies the older single-file demonstration and its 512 MiB limit. It does not exercise a real account, private storage or multipart upload.
3. Select a format and check the saved-job, reload, cancellation and unavailable-source states described in `2026-09-23-full-book-audio-export.md`. Synthetic encoding is optional; previously saved synthetic files can be reused for UI checks.
4. For the production UI contract, intercept its API with a synthetic preview containing `maxOutputBytes: 4294967296` and `maxPartBytes: 67108864`. Confirm separate total/part limits, the single complete download description and the absence of resumable-download promises. Repeat at 390px width and with missing source audio.
5. Run the focused multipart/job/queue/HTTP/storage tests below. They use tiny local files and mocked storage, including failed or delayed checkpoints, ownership changes, cancellation, corrupt or incomplete parts, cleanup and HTTP Range rejection.
6. Confirm every rejected export has no download link and no replacement speech request. A real private export, worker restart and provider/voice test require their own authorized environment verification; this local demo does not establish those results.

```sh
npm exec -w @verkli/web -- vitest run src/lib/audiobook/full-book-export-parts.test.ts src/lib/audiobook/full-book-export-jobs.test.ts src/lib/audiobook/full-book-export-queue.test.ts src/lib/audiobook/full-book-export-handler.test.ts src/lib/audiobook/full-book-export-supabase.test.ts
```

## Contract

The existing server-owned `ai_jobs.output` stores a strict version-2 manifest. It binds owner, book, edition, source snapshot, job and worker attempt to the complete file's size/hash and ordered parts. Each part has a canonical attempt path, contiguous offset, exact size and SHA-256. Existing version-1 single-file artifacts remain readable.

Output is limited to 4 GiB, 64 MiB per part (or the smaller private bucket limit), and 4,096 parts. The effective total also respects the part-count limit. Existing limits remain: 500 chapters, 128 MiB per source, 2 GiB combined source audio, 8 GiB decoded PCM and one hour of processing. Encoding and staging need sufficient writable scratch disk; no bucket or infrastructure setting is changed here.

Every stored part and the complete stored byte sequence are verified before source revalidation and compare-and-swap publication. Downloads authenticate once at the HTTP boundary, validate the current source, then recheck the owned book/edition and exact completed artifact before each part. Role/session authorization is not continuously refreshed inside an already-open part. Streams verify part and full-file size/hash, use backpressure and close upstream on cancellation. Explicit Range requests return 416 with the authorized file's size; successful responses advertise `Accept-Ranges: none`.

## Cleanup and operational limits

Before the first upload, record the planned attempt in the job output, checkpoint it in the existing BullMQ job, and schedule a canonical delayed cleanup action on the same queue. Missing or uncertain checkpoint acknowledgement stops upload. No speech or billing action is used by export or cleanup.

Cleanup re-reads publication state and preserves active/completed artifacts and unknown database outcomes. Confirmed deletion must not invalidate a healthy worker's revision. Previous attempt references remain recoverable until cleanup succeeds; ledgers are limited to three attempts and 4 MiB. Delayed cleanup jobs retain their original immutable targets even after success, allowing another reconciliation if a remote PUT finishes beyond local abort/deadline bounds.

Recovery depends on retained queue data and available workers. The observed Redis configuration (AOF off, periodic snapshots) is not proof of crash durability. Purging the queue, Redis data loss or permanent worker unavailability can lose automatic recovery. Deleting a completed job after its scheduled cleanup already protected it, or a remote write arriving after all cleanup bounds, may require a manual rerun of the retained cleanup job. No permanent orphan-cleanup guarantee is made.

No schema, dependency or Redis configuration change is included. Production activation remains separate and disabled by default. Validation uses mocked storage and synthetic audio; no real private asset reads, DB/storage writes or paid provider calls are part of this package's local evidence.
