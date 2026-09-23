# E1: local audio export fixture

Authorized scope: a development-only export UI and actual synthetic MP3128/320 and M4B downloads, without provider, database, storage, dependencies or production integration. Base39d09ae8 remains frozen elsewhere. The full delivery sequence is in the shared NASTA-LEVERANSPLAN.md. This package implements only E1.

Plan: (1) validated immutable source/format/metadata contract; (2) bounded local encoding/probing with normalized sample-count chapter boundaries and deterministic synthetic sources; (3) dev-only endpoint and UI showing idle/working/failed/ready/cancelled states and actual downloads; (4) actual encode/decode/metadata checks, route gates and browser downloads including 390px. No new fullgate until release owner grants a slot.

No source quality gain is claimed for320kbps or resampling. The fixture starts from synthetic PCM, not a real128kbps provider master. M4B AAC128 is a local test profile, not a new commercial format decision. No manuscript, voice upload or real book is involved.

Primary format references: [FFmpeg metadata](https://ffmpeg.org/ffmpeg-formats.html#Metadata-1) and [ffprobe](https://ffmpeg.org/ffprobe.html). Tools are existing local FFmpeg/ffprobe8.0.1; target deployment availability is not verified here.

## Local QA (6 steps)

1. With existing Node 22 and FFmpeg/ffprobe on PATH, run `npm run dev -w @verkli/web -- --hostname 127.0.0.1 --port 3247`; open `http://127.0.0.1:3247/dev/audio-export`. Confirm the initial empty state and synthetic source label.
2. Select MP3 128 kbps, create, then download. Repeat for MP3 320 kbps and M4B. Each export must have a real downloadable file and report 9.875 seconds and three source chapters.
3. Run `ffprobe -v error -show_streams -show_chapters -show_format -of json <downloaded-file>`. Verify MP3 bitrates 128000/320000, title `Vägen hem`, author `Demo author`, narrator `Synthetic tones`, language `swe`; M4B chapter starts 0, 2.25, 5.375 seconds and final end 9.875 seconds.
4. Select each failure scenario (missing chapter, unavailable encoder, size limit), create, and verify an explicit error with no download link.
5. Return to the complete source, create and immediately cancel. Verify cancelled state and no download. At 390px width verify no horizontal overflow.
6. From repo root run `RUN_LOCAL_AUDIO_EXPORT_TESTS=1 npm run test -w @verkli/web -- src/lib/audiobook/export-contract.test.ts src/lib/audiobook/export-local.test.ts src/app/api/dev/audio-export/route.test.ts src/app/dev/audio-export/page.test.tsx`. For automated browser downloads, run `node apps/web/scripts/qa-audio-export.mjs`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium binary if needed. No browser installation is required by this package.

## Evidence and limits

On 2026-09-22, all 21 targeted tests passed, including real encoding/decoding for all formats, decoded tone order, source hash changes, symlink escape, subprocess cancellation, concurrent request exclusion, oversized requests and non-development route/page guards. Targeted ESLint for all 12 source/test/script files exited 0. Browser QA passed 8 checks with Chromium 151.0.7922.34, downloaded all three files and fully decoded each. Desktop and 390px screenshots were inspected.

Evidence is in `/Users/admin/Documents/Verkli/Fardigstallande-2026-09-22/ljud/`: `export-targeted-tests.log`, `export-lint.log`, and `export-ui/` (result JSON, screenshots, actual downloaded files). The browser script writes file sizes and SHA-256 values into its result. Local encoder tests requiring FFmpeg are opt-in; contract, boundary and endpoint tests run without FFmpeg.

Status: implemented and verified locally with synthetic sources; independent review pending. No production book/storage/export integration, deployment or real audiobook final test. Full lint, typecheck, suite and build remain pending the release owner's coordinated slot. Existing dependencies and tools were reused unchanged. Encoding is limited to one request per development server process, with bounded sources, decoded PCM, subprocess time/output and request size; these fixture limits are not production product policy.
