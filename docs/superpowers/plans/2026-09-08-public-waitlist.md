# Public waitlist redesign — 8 September 2026

## Outcome
Explain Verkli in the first viewport and give authors and readers one obvious way to request access. Use Verkli’s real mark, Montserrat Alternates, and violet–rose–apricot palette. Replace the dated device montage with an interactive, explicitly illustrative manuscript / translation / audio preview. No fabricated traction, invented books, or revenue promises.

Base: current `platform`, `fb455a8`. Isolated branch: `codex/waitlist-20260908`.

## Implementation
1. Preserve the existing author/reader request handlers and storage contracts in `apps/web/src/app/waitlist/page.tsx`. Add an accessible role selector; keep inactive forms mounted so switching preserves draft input. Cover request, success, duplicate, failure, and restoration with intercepted browser requests before changing this behavior.
2. Recompose the page with branded navigation, a clear product headline, primary signup, product preview, a concise workflow, reader invitation, and FAQ. Create `WaitlistProductPreview.tsx` and route-scoped `waitlist.css`; retain the real book order component and mobile book link.
3. Keep illustration honest: sample manuscript and edition previews are labelled; no simulated provider generation or fake audio playback. Support keyboard interaction, 320px screens, visible focus, and reduced motion.
4. Run waitlist unit checks, lint, TypeScript, full unit tests, production build, and isolated browser checks. Inspect desktop and mobile screenshots. Only stubbed requests during QA: no real signup, payment, email, or provider job.
5. Deliver a localhost preview and per-file diffs with a 3–7 step QA record. No deployment as part of this design change.

## Acceptance
- A new visitor can identify Verkli as an AI workspace for creating, translating, narrating, and publishing books.
- Author and reader signup remain independent and retain existing server contracts.
- Johan’s book remains visible and orderable using the unchanged order flow.
- No new dependency, schema change, unrelated refactor, or changes to `main`.

## Completion
Implemented and checked on 8 September. Local production preview: http://127.0.0.1:3016/waitlist. Verification and the six-step manual script are recorded in `docs/qa/2026-09-08-waitlist.md`. Branch and worktree retained for review; no publication performed.
