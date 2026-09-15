# Conversational book agents — implementation plan

Goal: authors talk to the visible specialist about their actual book, receive concrete proposals, and use supported changes directly from the conversation.

Architecture: extend the existing authenticated book chat and dock. The model proposes a bounded, validated action; it never directly executes a mutation. Existing editor transactions, cover generation, audio preview and pricing controls execute the author-selected action. Keep existing auth, feature flags and provider charging paths. No new dependency. Persistent pronunciation storage requires the owner's pending schema decision.

## Required journeys

1. Edith: identify one exact passage in the current chapter, show before/after, apply through Tiptap with Undo and existing autosave. Reject a proposal after chapter/draft changes or when the target is missing/ambiguous. Do not flatten rich text.
2. Alma: the same correction flow for the currently opened edition, with its chapter context. Do not claim an unavailable original/translation comparison was checked.
3. August: propose a spelling-to-spoken-form pronunciation rule, show the original and spoken sample, generate an actual short preview through the existing owned-book TTS route. The manuscript is unchanged. If schema approval arrives, save rules per edition, validate them on the server and apply them in preview and queued narration; otherwise label preview-only explicitly.
4. Cover: discuss a visual brief with Stella, then populate the existing cover prompt and generate options through the existing cover operation. Keep the old cover until the author chooses an option. Do not call this an edit of the existing image unless an image-edit backend is actually used.
5. Ernst: conversational pricing guidance with a concrete editable pricing draft, using existing currency/amount controls and explicit Save. No automatic financial decisions.
6. Stella marketing remains feature-gated. Cover assistance does not unlock marketing. No auto-publication, email or campaign send.

## Execution

- [x] Define shared action and conversation types with Zod: bounded history, bounded proposals, supported tools only. Tests must reject malformed proposals, instructions-as-actions, excessive input, missing/ambiguous text and cross-persona actions.
- [x] Extend writing assistant prompt with actual specialist/tool context and bounded conversation history. Request structured proposals only for the new client mode; legacy replies remain supported. Provider failure yields a clear unavailable state with no executable actions.
- [x] Extend owned-book chat route: validate context, retain author/ownership/rate checks, fetch scoped chapter and edition context, pass history, attach trusted chapter identity to proposals. No IDs or URLs chosen by the model are executable.
- [x] Make avatar companions launch the contextual dock. Give each specialist a separate conversation/draft within the book session, retaining history on panel switches. Guard late replies and double submits.
- [x] Render before/after, pronunciation audio and cover/pricing proposal cards with pending/error/done states. Execute via typed callbacks; never mark success before completion. Preserve failed requests and drafts for retry.
- [x] Add a small editor-ready seam after the independent editor-polish candidate; enforce current chapter and text revision, single contiguous exact text match, one undoable transaction and normal autosave.
- [x] Add the short pronunciation preview and cover/pricing callbacks. Implement persistence only after the schema decision.
- [x] QA against synthetic fixtures: follow-up messages, persona switching, changed chapter/stale proposal, apply/Undo, audio preview errors, cover generation errors/choice, duplicate clicks, narrow/wide layouts and production-hidden fixture. Run lint, TypeScript, unit tests and production build; independent review before release.

## Release proof

The public team is an introduction. Functional claims are based on authenticated book tools, and mocked UI tests are distinguished from real provider smoke tests. Final report includes exact SHA, filewise diff, commands/results, remaining limitations and five manual UI steps. Deploy only the reviewed package and canary the same SHA.

## Verified implementation — 15 September

The authenticated book workflow now opens a separate conversation for Edith, Alma, August, Stella or Ernst. The shared action schema limits each reply to one text correction and at most three proposals. Responses carry the trusted chapter identity and snapshot. Conversation follow-ups include earlier proposals and their actual execution outcomes.

Editor changes use exact ProseMirror ranges, explicitly retain target marks, preserve unaffected rich text and use one Undo step. A changed draft, different chapter, ambiguous match or formatting boundary is refused with a useful message. Cover generation, pronunciation preview and chat have duplicate-request guards, timeouts and retry states. Edition navigation keeps its language query.

**Remaining decision:** pronunciation is preview-only. Persistent per-edition pronunciation rules and use during full audiobook regeneration require the owner's pending approval for a database change. No schema, dependencies or feature flags changed. Full chapter editing and publication still require the existing author controls; no automatic campaign sending or price saving.

### Verification

- `npm run lint -w @verkli/web`: passed.
- `npm exec -w @verkli/web -- tsc --noEmit`: passed.
- `npm run test -w @verkli/web`: 193 files / 2,195 tests passed.
- Eight focused editor transaction tests include reproduced red-to-green formatting regressions, stale text, exact targeting and Undo.
- `QA_BASE_URL=http://localhost:3066 node apps/web/scripts/qa-agent-conversations.mjs`: six browser journeys passed. Simulated responses and silent audio are isolated to the development fixture; no provider/database requests escape it.
- Actual Anthropic Sonnet 5 smoke: Edith spelling correction and August pronunciation proposal both valid, 2,401 total tokens, about 2.4 seconds each, synthetic text only.
- Independent review: all reported issues resolved; no remaining blockers, subject to final build and deployment checks.
- Actual ElevenLabs smoke: one request / 38 synthetic characters produced a valid 2.09-second MP3. Technical validity checked; pronunciation quality awaits listening. The existing provider uses text language detection.
- Production build: passed with the same non-secret Supabase placeholders as CI and emitted `ƒ Proxy (Middleware)`. The first attempt without required public build variables was corrected without changing code or live configuration.
- Deployment outcome is recorded in the external release report, with exact candidate/release SHA and filewise diff.

### Manual QA

1. Open a test book, choose Write and Talk to Edith. Ask for a spelling correction, inspect before/after, apply, confirm saved status, then Undo.
2. Change the chapter after receiving a proposal. Applying it must refuse safely. Open a translated edition and repeat a scoped correction with Alma.
3. In Audio, Talk to August and describe an incorrectly pronounced word. Review the spoken form and play the short sample. The written manuscript stays unchanged; this does not yet save a full-book pronunciation rule.
4. In Cover, ask Stella for a new visual direction, refine it in a follow-up and generate options. Choose the cover yourself. In Pricing, ask Ernst for a draft; it remains editable until the existing Save action.
5. Switch specialists, close/reopen the dock, and test a narrow screen in light/dark themes. Drafts and in-session conversations must remain separate, with clear retry states if a request fails.

### Production follow-up: invalid proposal recovery

The first release (`d546ff25`, PR #44) passed authenticated production checks for Edith's correction, Undo and persistence, Stella's four generated cover options, and Ernst's editable 99 SEK draft. One actual August reply was refused by strict validation; the two direct provider reproductions were valid, so no specific malformed field is claimed as the cause.

The follow-up permits one regeneration only when the first proposal fails validation within eight seconds. The same owned chapter context and strict parser are retained. Rejected model content is not reused as instructions or written into diagnostics. Logs classify JSON, structure and context failures using fixed codes. Provider outages and slow responses are not retried. The interface distinguishes an invalid suggestion from an unavailable service.

Verification: 193 files / 2,206 unit tests, full lint, production build and all six isolated browser journeys passed. New recovery tests prove the attempt cap, deadline, strict rejection, combined usage and safe diagnostics; the browser fixture covers both invalid-proposal and outage messages. Independent review found no blockers. The external release report records the follow-up SHA and post-deploy August result.
