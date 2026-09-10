# Waitlist experience — verification

2026-09-10. Based on current `origin/platform` (469d8f29). The approved author landing is reused directly; the waitlist receives a full-width working studio, signup-first hero, swipeable chapters, scroll unfolding, pointer reflection and the original animated butterfly. Both themes retain Verkli's colour and typography system.

## Verified

- Production build, ESLint and TypeScript pass.
- 169 unit-test files / 1,724 tests pass.
- 35 production-build browser tests pass across waitlist and author landing.
- 320/390px signup/order checks and 1024/1440px book-order layout checks pass.
- Four visual combinations inspected: light/dark at 390/1440px, with no document overflow or browser errors.
- Pointer reflection reacts; the studio stops moving once used. Chapters unfold while scrolling. Butterfly responds to click; switching to reduced motion removes wing animation.
- Existing signup success, duplicates, reload restoration, role drafts and error/retry behavior verified with mocked endpoints. No production signup or purchase was created.
- Prepared translations and narration stay separate from custom drafts. Playback requires a click and stops when changing tools. No AI generation request is made by the demo.
- Independent review found a repeated-fragment navigation bug. Reproduced and fixed in the shared studio. Additional regression testing reproduced SSR motion-preference and direct-link hydration mismatches; stable hydration snapshots fix both. All seven new navigation/accessibility tests pass.

Run against the local production preview:

```sh
WAITLIST_PREVIEW_URL=http://127.0.0.1:3019 PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.waitlist.config.ts
```

Run from `apps/web`. Use the project's installed Node.js 22 runtime.

## Manual QA — six steps

1. Open `/waitlist` at desktop and phone width. Switch light/dark. The signup remains above the studio, and the page has no horizontal overflow.
2. Switch author/reader roles and enter a different email draft for each. Switch back and confirm both drafts remain.
3. Open the studio. Edit the title and manuscript, then select Publish and open the book. Confirm it contains your words. Use the prepared sample to explore translation and narration.
4. Swipe between studio tools on a phone. Scroll to the feature chapters and swipe horizontally through them; vertical page scrolling still works. Follow the same chapter link again after changing tabs.
5. Scroll to the reader invitation, click/tap the butterfly, then select Join as a reader. The reader role is selected and its email field is in view. Repeat with reduced motion enabled.
6. Open the FAQ and follow Beställ Johans bok nedan. The existing order form is reachable on mobile and uses two columns on desktop.

Production rollout is tracked separately by PR, required CI, Railway deployment SHA and live browser verification. The legacy Vercel account is not the configured production destination.
