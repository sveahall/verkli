# Full-book export completion plan

Base: frozen private export 63160465. Scope: reuse existing generated chapter audio; MP3 128/320 and M4B with verified ordered chapters and metadata. Never generate speech or charge during export/retry.

1. Add a disk-based encoder with streamed source hashes and finite, published disk/output limits. Verify a synthetic book beyond both the old 20-chapter and 349.5-second limits.
2. Reuse existing ai_jobs and audiobook queue only after checking their current schema/RLS/dispatch. Persist owner, edition, source snapshot, format and idempotency identity. Fence worker attempts and cancellation; revalidate source before publication/download.
3. Build localhost UI for queued/running/completed/failed/cancelled states, refresh recovery and genuine file download. Show capacity and source failures honestly. Keep the old bounded E2 defaults unchanged.
4. Add production adapters using existing private storage with checked capacity; no bucket/schema/dependency changes. Test against synthetic adapters only until live verification is separately authorized.
5. Run targeted tests, actual synthetic exports and browser QA, independent review; queue lint/typecheck/full suite/build through release owner. Integration, activation and real private/provider tests remain separate recorded outcomes.

File boundary agreed with coordinator: new full-book-export files; minimal parameterized snapshot reuse in private-export-contract/supabase; minimal export dispatch in audiobook-worker. No unrelated refactor.

No real private audio reads, database/storage mutations, paid provider calls or production activation are part of local validation. Export creation must not use the generation queue action or synthesis budget code.
