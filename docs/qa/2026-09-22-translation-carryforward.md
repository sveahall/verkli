# Translation carry-forward — 2026-09-22

## Scope and identity

Base: `e0954ac2b4f8ded7f24c435f5cb7f0df0056671d`; branch: `codex/launch-translation-carryforward`.
Eight code/test files plus this QA note. No dependencies, schema, origin helper or middleware changes.

Chapter-read errors now propagate before request-language fallback or metadata persistence. Preview and translation return503/TRANSLATION_SERVICE_UNAVAILABLE with feature-prefixed server logging. Translation awaits the existing paid-claim cleanup. The panel maps API codes to readable messages; the401 session-expired message remains.

The current12-chapter detector, sourceLanguage hint, AI master switch, billing and saved-translation review remain intact. The older18-file launch patch is frozen and must not replace current platform files.

## Verification

- Red: the four new cases failed before the production changes;22 existing tests passed.
- Green:37 tests in five files passed: book-translation, translate route, translation-preview route, TranslatePanel, TranslatePanel.unsupported-pair.
- Paid cases execute the real claim/release helpers against a fake redemption table. A won claim is released once for the exact session/kind before response; a lost claim is untouched. Neither queues work or writes translation state. No Stripe/provider call occurs.
- Changed-file ESLint and git diff --check passed.
- Separate, temporary header characterization plus existing origin/middleware regressions:80 tests passed. These are not production-proxy or browser-CSRF proof; middleware/helper are unchanged.
- Full test, build and lint gates are not claimed here; the release owner reserved those runs. No merge or deploy performed.
- Browser E2E was previously run against the older frozen fixture, not this exact carry-forward. Current panel tests render the component; they do not replace the authenticated UI checks below.
- Platform advanced separately to8e732a72884a0a52da65df8676326a4b1a774151 (PR97). This patch retains its approved e0954ac2 base pending coordinated review/integration.

## Local UI QA (staging data;5 steps)

1. Start this checkout with configured local test credentials using `npm run dev -w @verkli/web -- --port 3188`. Sign in and open a test book at http://localhost:3188/author/books/<book-id>?panel=translate.
2. Use an edition without language metadata containing a short introduction followed by substantial saved text. Select French and load the preview. Verify the saved text is used and sourceLanguage is sent.
3. In browser network response overrides, return422 with `{ "error": "SOURCE_LANGUAGE_MISSING" }` for preview and translation-start. Verify readable guidance appears, the raw key is absent and the manuscript is unchanged. Return503/TRANSLATION_SERVICE_UNAVAILABLE and verify readable retry guidance.
4. Restore normal responses and retry. Verify preview recovers; a normal translation enters the existing reviewed-translation flow. Repeat with AI disabled and confirm the existing master-switch guard still blocks model work.
5. With local Stripe test data, simulate the source-read failure after winning a redemption claim. Verify503, exactly that redemption released, and no queued job. Repeat with an already-claimed session on a Pro account; the existing claim must remain. The automated paid cases cover this deterministically without payment/provider traffic.
