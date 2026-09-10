# Waitlist experience

The approved author landing is the design reference. Apply its interaction and brand language to the waitlist, with signup visible before the studio on every screen. User has approved this direction and live deployment.

| Before | After | Why |
| --- | --- | --- |
| Three static mockup images | Shared interactive author studio across the page width | Visitors can edit, switch languages, listen and open their book before joining |
| Narrow split hero | Editorial heading beside the role selector and signup | Gives both the product story and email form a clear first impression |
| Static feature columns | Brand-coloured chapters that unfold on scroll and snap on horizontal swipe | Explains the journey with tangible motion without taking over vertical scrolling |
| Plain reader invitation | Dark brand invitation with the original interactive butterfly | Connects the reader path to the same identity |

## Implementation
1. Replace image-switch tests in `apps/web/e2e/waitlist-public.spec.ts` with functional studio tests. Add coverage for swipe, narration, reader signup navigation and reduced motion. Run a new test against the existing release to confirm the missing experience.
2. Replace `apps/web/src/app/waitlist/WaitlistProductPreview.tsx` with the shared `AuthorStoryProvider` and `AuthorStudioExperience`. Preserve sample disclosure and custom manuscript guards.
3. Update waitlist `page.tsx` composition and `waitlist.css`: wide editorial hero, paper/ink surfaces, violet/rose/apricot accents, shared scroll reveal, native swipeable chapters and butterfly invitation. Preserve both signup state machines and the book checkout.
4. Verify 320/390/1440px, light/dark, focus, reduced motion, form success/error/duplicate restoration, narration and draft persistence. Run lint, types, unit tests, production build and both author/waitlist browser suites.
5. Review diff against current platform, commit, create PR, merge after required CI and verify the exact Railway production release on www.verkli.com and its Railway domain.

No dependencies, database changes, authentication changes or external AI calls.

## Integration findings
The shared studio now handles repeated same-fragment feature links and initializes deterministically before following URL fragments. The existing SSR-safe reduced-motion subscription is reused by the scroll and butterfly components to avoid hydration mismatches when rendering the waitlist. Regression cases were observed failing before these changes and passing afterward.
