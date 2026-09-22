# Audio timing delivery, 22 September 2026

## Implemented boundary

New audiobook synthesis asks ElevenLabs for original-text character alignment in the same response as the audio. Character arrays must exactly reconstruct narration text, all times must be finite/nonnegative/ordered, and words retain UTF-16 offsets. Missing/invalid alignment yields playable, explicitly unsynchronized audio. Normalized alignment, bitrate-derived duration and fabricated timestamps are never used as text timing.

New chapter object names derive from audio bytes plus exact narration text. This fixes the old filename collision between different voices/models sharing a chapter text hash. The existing database cache key stays unchanged. Existing audio is reused without a paid backfill and remains unsynchronized if its sidecar is missing. Smoke audio never receives timing or a reusable cache row.

Timing is a private `<audio_path>.timing.json` sidecar, version 1, carrying chapterId, bookVersionId, exact audioPath and `{sourceText, words:[{word,start,end,startOffset,endOffset}]}`. Storage failures do not publish a new cache pointer as successful. No schema, new package, feature flag or provider credential changed.

The playback route performs the existing book/chapter publication and entitlement checks before accessing the sidecar. It validates exact file, chapter, edition and current narration text; malformed/absent/oversized sidecars become `timing:null`. Successful playback responses are `Cache-Control: private, no-store`. The sidecar path is never accepted from the client. This package does not relax any access check.

The reader applies a CSS Highlight range to existing prose and checks exact DOM text before highlighting. A stripped duplicate chapter title uses an explicit source offset. Missing browser support or mismatched text produces an honest unsynchronized state. The media element's currentTime is the sole clock, including seek, rate change and resume. Chapter/edition changes unmount the old player and clear ranges; cancelled fetch responses cannot restore it. Saved manual highlights and manuscript formatting remain untouched.

## Local UI QA (6 steps)

1. Start the existing web app in development with nonempty local placeholder Supabase public values and `NEXT_PUBLIC_AUDIOBOOK_ENABLED=true`, on port 3214. Open `/dev/audio-sync`. The page labels all responses, timing and tones as synthetic and rejects production/test rendering.
2. Seek to 1.5, 4.5 and 7.5 seconds. Verify the first, second and third words. Seek back and into 3 seconds of silence; the highlight must clear in the gap.
3. Play and change speed to 2×. Switch chapter and edition. The previous word/audio must disappear and the new text must match the new sound position.
4. Enable Resume at 7.5 seconds. The 30-second fixture must open at that offset after metadata loads. Manually seek to zero; it must stay there.
5. Select missing timing, changed manuscript, delayed response and load error. Verify honest unsynchronized copy, no highlight on changed text, no late old chapter audio, and an error with Retry audio.
6. Repeat at 390px width. Run `node apps/web/scripts/qa-audio-sync.mjs` against the local server for deterministic browser assertions and screenshots. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` reuses an installed browser; `AUDIO_SYNC_QA_OUTPUT` selects the artifact directory.

## Evidence and limits

Report folder: `/Users/admin/Documents/Verkli/Fardigstallande-2026-09-22/ljud/`. `STATUS.md` is authoritative for checks, commit and integration state. Browser `ui/result.json` and screenshots are synthetic proof of the client/media path, not ElevenLabs quality or production deployment. API unit tests cover private timing denial and identity mismatch; storage unit tests cover publication order/failures and smoke isolation. A real provider response, full-book production, 30-minute real mobile listening and human pronunciation assessment are not performed here.

No auto-scrolling is introduced: playback must not take control away from the reader. Old source-text edits may intentionally leave older audio playable but unsynchronized. Saved listening offsets are still chapter-scoped by the existing schema; an audio revision is not a new resume identity. Granular sentence editing and stress controls remain separate work.

## Reader/cache contract

Timing contains private chapter text and must be treated exactly like the narration. No service-worker cache, persistent localStorage, general reader HTML/API cache or public timing URL. Future explicit offline text bundles exclude audio blobs, signed URLs and timing. Reader/offline owner acknowledged this boundary. Account/entitlement changes must reacquire playback through the server. Signed audio URLs retain the existing 15-minute TTL; this work does not add revocation beyond that contract.

## Original requirement and proposed export contract

The nonbinding proposal `/Users/admin/Downloads/Verkli Erbjudande Fredrik 2026-07-29.docx`, Bilaga 1 §3.3, was read directly. It states: "Export: MP3 (128 / 320 kbps) och M4B." It also states: "Steg 3, Mixning: bakgrunds-silence, kapitelmarkeringar och metadata (ID3) läggs till automatiskt." These are original proposal requirements, not delivered functionality or signed contract terms.

The following details are this package's concrete engineering proposal. Original §3.3.1 also proposes a minimum five-minute voice sample, while the later sprint plan proposes 90 seconds. That discrepancy requires an explicit sample-policy choice before enabling a recorder/clone flow. §3.3.2 requests sentence regeneration with emphasis and chapter-specific voices; neither is certified by this timing delivery.

These are explicit acceptance requirements, not a claim that an author export UI is delivered:

- Input: authorized book ID, edition ID/language, ordered chapter IDs, immutable audio paths and hashes, exact measured durations, title/author/narrator metadata and export format. Reject missing chapters, smoke assets, mixed editions and changed source versions. Never combine an arbitrary client-supplied path.
- Per-chapter MP3: one numbered file per chapter, title/album/artist/track/language metadata; preserve source encoding where possible. The original proposal specifies 128/320 kbps. The present provider default is 128 kbps; transcoding that to 320 kbps does not create a higher-quality master. A 320 kbps deliverable must explicitly disclose transcoding, or use an approved higher-quality source and measured encoder settings.
- Whole-book MP3: a playable concatenation in chapter order, with a sidecar chapter manifest. Use decoded/probed durations, not bitrate estimates, for chapter boundaries. An MP3 manifest fallback must not be labelled as a downloadable complete MP3.
- M4B: MP4 container with AAC audio, monotonic chapter markers in milliseconds, correct book/author/narrator/language metadata, and a final boundary within one audio frame of measured duration. Artwork must be licensed and tied to the same edition. Installed FFmpeg/ffprobe (or the existing ffmpeg-static dependency) suffice; no new package is required.
- Download: server rechecks author/edition ownership, signs a private immutable export for a short TTL, reports queued/working/failed/ready states truthfully, and keeps failed/incomplete exports unavailable. This package adds no production download route or unsupported marketing promise.

Current worker only copies/concatenates files and can fall back to a playback manifest. Its duration estimates are unsuitable for M4B chapter metadata. Whole-book MP3 quality variants, M4B chapter/metadata export and downloadable per-chapter bundle require a separate implementation. Local synthetic format checks cannot certify a real full book.

## Full book, pronunciation and own voice QA

Full-book acceptance: snapshot edition/text hashes and chapter order; run approved bounded narration; prove every nonempty chapter has a playable asset in the correct language/voice; verify start/middle/end, chapter transitions, absence of truncation, measured total duration and manifest completeness; listen on a real mobile device for at least 30 minutes including lock/background/resume. Review provider cost receipts against reservation. Do not rerun paid synthesis automatically to create missing old timing.

Pronunciation acceptance: persist explicit rules per edition, preview a bounded synthetic sentence, reload to prove persistence, queue narration with a revisioned rule snapshot, confirm all matching uses and unchanged manuscript, then edit/delete a rule and prove cache invalidation. The current August pronunciation preview and saved AI preferences do not meet this full-book contract. Schema design/approval is required before adding a new persistent rule store.

Own voice acceptance: use only synthetic or explicitly consented samples; consent must specify ownership/use and be recorded before upload. Verify author isolation, file type/size/duration validation, retry without duplicate provider voices, selected owned voice reaching the job and provider, deletion/failed-delete states, and refusal to queue a deleting/revoked voice. Verify a user-selected voice is not silently overridden by an environment default. Real upload/clone/multilanguage narration needs a separately approved sample and hard max cost; no such authorization is assumed.

Confirmed gap: `/author/voices` lists/deletes voices, but has no recorder; `/api/author/voices` is GET only; `cloneVoiceFromSample` has no production caller. The full-book generate route chooses the configured narrator, and the worker currently prioritizes environment voice over job voice. Therefore end-to-end own-voice use is unbuilt, not merely untested. Next package must implement this chain with ownership and consent before paid verification.

Source specification references: `docs/sprint-plan-pre-raise.md` Week 2, `docs/roadmap.md` audio-text sync, `docs/plans/2026-09-15-conversational-agents.md` pronunciation scope, checklist rows 28–32. Provider response contract: [ElevenLabs Create speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps). The original 128/320 kbps and M4B proposal is now located; the source-quality and voice-sample policy decisions above remain.
