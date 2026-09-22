# Pronunciation preview implementation plan

Goal: a provider-independent, development-only editor for edition-specific pronunciation rules, using the approved owner/edition-bound CAS adapter design. The timing package remains frozen in its original checkout. SQL proposals and their manifest remain unchanged outside this worktree.

Architecture: pure literal single-pass matching and validated scope/snapshot types; an adapter-backed reusable React panel; a synthetic in-memory adapter for the dev route; disconnected server/worker integration contracts that default to unavailable. No database/provider calls, new dependency, manuscript mutation, generated types, migration or active production feature.

Design follows existing Verkli typography, tokens and controls. An editorial two-column panel shows written targets/spoken aliases and manuscript/narration previews. Small-screen layout stacks. Accessible statuses distinguish draft, saving, session-only saved, failure and conflict. Conflicts preserve draft and require explicit reload of the latest snapshot. Edition/owner changes cannot apply late responses to the new scope.

## Execution

- [x] Define `lib/audiobook/pronunciation.ts` scope/snapshot/adapter types, validation and literal single-pass longest-match transformation. Tests cover overlap, nonrecursive aliases, case sensitivity, special characters, duplicates and invalid scope responses.
- [x] Build `features/audiobook/PronunciationEditor.tsx` with clear empty state, draft comparison, revision CAS, load/save errors, explicit conflict reload and unchanged manuscript preview.
- [x] Build development-only `/dev/pronunciation`, using an isolated in-memory adapter and simulated conflict/failure/delay controls. Page test rejects production/test rendering.
- [x] Prepare disconnected server/worker/cache contracts with injected ownership/store dependencies. Disabled path does not touch dependencies; enabled contract is tested only with local fakes. No new live route/store or worker import is wired.
- [x] Run targeted tests/lint and local browser QA: add/edit/delete, preview overlap, session-only save/reload, failed save, CAS conflict, owner/edition switch during late work, 390px. Fullgate remains separately queued.

The 100-rule limit is a proposed safety bound in this demo, not an approved product plan. Voice sample duration is outside this UI. Text transformations change narration only; matching reader timing remains unavailable when narration differs until verified mapping exists.

## Local QA (6 steps)

1. Start development on port3215 and open `/dev/pronunciation`. Confirm synthetic/session-only notice, empty rules and no generated voice.
2. Add `Mira -> Mira Bay` and `Mira Bay -> Meer-ah bay`. The longest original match wins; inserted aliases are not reprocessed. The manuscript preview must remain unchanged.
3. Save in demo, reload saved demo rules, and confirm saved rules return. A full page refresh must clear this in-memory demo.
4. Simulate a failed save and a concurrent writer. Both retain the draft; conflict disables saving until explicit “Load latest and replace draft”. Failed writes must not be presented as saved.
5. During a slow save, switch edition and then author. A late response must affect only its original scope. Simulate load failure and retry; no editable empty state masquerades as a successfully loaded edition.
6. Delete every rule and save the empty revision; repeat at390px. Run `node apps/web/scripts/qa-pronunciation.mjs` with an installed Playwright browser for assertions/screenshots.

## Integration boundary

`pronunciation-service.ts` exposes a disconnected GET/PUT handler factory, not an installed Next route. Its default503 path calls no dependencies. Explicit local-test enablement injects authentication, edition ownership and an atomic owner/book/edition CAS store. Client scope fields are rejected; every response is no-store; store responses are validated before returning success. No Supabase implementation or production flag exists in this package. Integration still requires approved store/schema, regenerated types, actual author-role guard/rate/body limits and review of the complete active route.

`pronunciation-worker.ts` is not imported by real workers or generation routes. Its default throws disabled. Explicit local-test enablement captures a deeply frozen rule snapshot and computes a versioned SHA256 cache identity including owner/book/edition/chapter/text/voice/model/language/revision/canonical rules. Edited/deleted rules invalidate identity. It returns no fabricated manuscript timing. It does not validate a real voice's provenance or dispatch, synthesize, bill, upload or publish audio.

The UI adapter is reusable but this editor intentionally labels every save as demo-session-only. Real persistence copy must not change before the reviewed store actually exists. The fixture is client memory, not authorization: real owner identity comes only from server authentication. Scope changes/remounts cancel old UI responses; already-started writes retain their original scope.

Evidence belongs in `/Users/admin/Documents/Verkli/Fardigstallande-2026-09-22/ljud/`: pronunciation targeted logs, `pronunciation-ui/result.json` and screenshots. These prove only local synthetic behavior. Full lint/types/build and production integration are not certified by targeted checks. The original timing package's fullgate remains separate.

Targeted verification:53/53 tests across5 files and9 browser checks passed. The final targeted ESLint run completed with exit0 and no warnings. Fullgate is not run for this follow-up package.

## Conflict recovery correction

A failed “Load latest” now retains both the draft and a load-failure lock. Editing, add/remove and save remain disabled; Retry loading rules remains available even when an older snapshot exists. Only a successful, validated current-scope read releases the lock and replaces the draft. Conflict is not cleared when a read merely starts. `scripts/qa-pronunciation-load-recovery.mjs` reproduces the original enabled-input failure and verifies repeated failure, successful retry and a delayed recovery read across author/edition change. No service/store/schema behavior changes in this correction.
