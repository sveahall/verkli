# Reader and administration brand coverage — 2026-09-10

Implements the approved contract in `2026-09-10-unified-brand.md`. All 35 page entries in these three families are traced below. Existing route, authentication, launch-flag, subscription, purchase, delivery and moderation behavior is retained. Billing content is shared and is covered by the author implementation.

## Shared work

- `components/reader/ReaderAppShell.tsx`: warm semantic surfaces, Verkli logo, labelled desktop workspace, visible current route, quiet active violet treatment, useful desktop spacing and mobile bottom navigation with safe-area clearance. Immersive reading continues to omit the sidebar and footer.
- Reader home, discover, library and book feature views: consistent display headings, distinct page/section hierarchy, calm book presentation, generous controls, typed cover fallback, explicit empty states and a clear-search action. Discovery no longer replays entrance animations when filters change. Its search label now accurately describes the existing title search.
- Reader cards, rails, author cards, genre selection and onboarding: aligned surfaces, borders and typography. Selection controls expose pressed state and keyboard focus; book cover hover no longer jumps.
- Chapter chrome, comments, reviews, locked chapter panels and settings/highlight controls: semantic surfaces and accessible primary text. Chapter prose body, generated prose CSS, reader font/theme definitions, highlight colors, persistence and selected font/spacing remain unchanged. Reading settings previews retain their actual light/sepia/dark palettes.
- Shared inbox, notifications, polls and clubs: same surfaces, form styling, message contrast and readable selection. Inbox conversation selection and Accept/Block actions are separate buttons, avoiding nested interactive controls.
- Admin layout/nav: same Verkli identity, compact sidebar, horizontal mobile navigation, active violet state and a return-to-product link. Dashboard, detail cards, operational panels, table controls and empty/error states use semantic brand colors; role checks, filters and mutations remain unchanged.

## Route trace

| Page route | Coverage and retained state |
| --- | --- |
| `/reader/billing` | Reader shell + shared BillingPageContent/BillingPageClient; subscription semantics preserved. |
| `/reader/bookmarks` | Existing redirect to library; target receives new library styling. |
| `/reader/clubs` | PageHeader/EmptyState, ClubsPageClient and BookClubCard/CreateClubDialog; disabled-feature state preserved. |
| `/reader/clubs/[id]` | Reader shell + BookClubDetail/ClubChat; membership and existing flag redirect preserved. |
| `/reader/feed` | Reader shell + shared page heading + deliberate unavailable empty state. |
| `/reader/home` | ReaderHomePageView: welcome, reading spotlight, progress list, statistics, author list and book shelves. No-spotlight state uses honest library/discovery copy, without a fabricated featured cover or duplicate discovery actions. |
| `/reader/inbox` | Reader shell + shared InboxClient; conversation/request selection, composition and empty states. |
| `/reader/library` | ReaderLibraryPageView: search, reading/purchased/saved/completed shelves, unavailable purchase notes and clear-search control. |
| `/reader/notifications` | Reader shell, brand page heading, notification list, caught-up state and full-size pagination/actions. |
| `/reader/orders` | PageHeader, semantic order cards, status badges and empty state. Purchase status and unlisted-book behavior retained. |
| `/reader/polls` | PageHeader/EmptyState, PollsPageClient, PollCard/PollCreator. Existing launch flag and voting permissions retained. |
| `/reader/profile` | Profile summary, account links, metrics, follows, reading history and highlights use the shared type/color hierarchy. |
| `/reader/settings` | Shell-aligned page heading, card sections, explicit selection/focus, labelled ranges that shrink at mobile widths; reader preview palettes/fonts preserved. |
| `/reader/authors` | Reader shell, shared heading, AuthorCard and explicit loading/error/empty results. |
| `/reader/authors/[id]` | Branded author cover/profile hero, published work, biography and follow/subscribe controls. Author images retain their colors. |
| `/reader/books/[id]` | ReaderBookPageView, metadata, chapter list, purchase/offline controls, reviews/comments, related books and demo finale. |
| `/reader/books/[id]/pod/cancel` | Warm status card, display heading and existing book-return action. |
| `/reader/books/[id]/pod/success` | Same status composition; real order state and fulfillment copy retained. |
| `/reader/books/[id]/purchase/cancel` | Same status composition; cancellation does not create an entitlement. |
| `/reader/books/[id]/purchase/success` | Same status composition; real checkout status and refresh behavior retained. |
| `/reader/discover` | ReaderDiscoverPageView: editorial catalog heading, accessible search/language/filter controls, author rail, sparse-catalog feature and empty results. Launch flag still enforced. |
| `/reader/genres` | PageHeader, semantic list cards, language controls and honest empty states. Discovery flag still enforced. |
| `/reader/lists/[slug]` | Reader shell, list heading, book grid and empty/loading/error states; missing lists still 404. |
| `/reader/onboarding` | Two-step headings, GenreGrid, BookSwipeCard, clear selected state and primary controls. No preference writes performed by QA. |
| `/reader/read/[chapterId]` | Immersive shell + ReadingView/navigation/audio/settings/highlight chrome; text themes/fonts/highlights remain reader-controlled. Locked/preview/paywall behavior retained. |
| `/reader/writers/[id]` | Existing alias redirect to branded author profile; no new view or route behavior. |
| `/admin` | Branded admin shell, operational page heading, live data cards, health badges and management links. |
| `/admin/author-applications` | Branded shell + shared tables/cards/forms, application filters, readable decision/status content. Admin guard retained. |
| `/admin/beta` | Branded shell + cards, empty/error states, funnel counts and event summaries; no artificial values. |
| `/admin/books` | Branded shell + search/status controls, book table and actions. Existing delete confirmation retained. |
| `/admin/books/[id]` | Metadata, chapter list and moderation content with shared type hierarchy; manuscript content intact. |
| `/admin/feedback` | Branded shell + shared filters, table, status controls and empty/error states. |
| `/admin/queues` | Branded shell + queue tables, health badges, retry control and actual service availability. |
| `/admin/users` | Branded shell + user search/table and beta control. No role or beta changes performed by QA. |
| `/admin/users/[id]` | Shared detail headings/cards/tables across account, authored books, reading activity, access and audit history. |

## Verification

- Targeted ESLint for all owned route/component directories: passes, no warnings when run from `apps/web`.
- Focused Vitest: 8 files, 51 passing tests covering reader shell links/immersive footer behavior, reader touch targets, discovery query behavior, library entitlements, chapter preference helpers, admin navigation, beta calculations and admin access.
- Scoped `git diff --check`: passes.
- Root reports the combined production build, full lint and 1,724 unit tests passing. The final integrated build includes the Home/settings presentation corrections; its authenticated browser recheck also passes.
- After the final Home adjustment, the focused 8-file, 51-test suite passed again; targeted ESLint also passes for all three final edited files.
- Real Chrome browser checks, including authenticated private reader routes and the actual admin redirect, are recorded below. Populated book/chapter content remains fixture-limited.

## Local QA script

1. Open `/reader/home` and `/reader/library` at 1440px and 390px; confirm the active navigation, book cards, search and empty states. Use the existing legitimate test account.
2. Open `/reader/discover`, `/reader/authors` and `/reader/genres`; verify search/filter links and no-results states with the existing launch flags respected.
3. Open an available published book and chapter. Check book actions, chapter navigation, reading settings, highlight panels and keyboard focus; do not buy, post, or save preferences during read-only QA.
4. Open profile, settings, notifications, orders, inbox, feed, polls and clubs. Verify their live, empty or feature-unavailable states at mobile width.
5. With a legitimately authorized admin session, inspect each admin page and its mobile navigation/table scrolling; otherwise record the denied/redirected state without bypassing it.
6. Repeat representative screens in light/dark and reduced-motion modes; verify headings, contrast, horizontal overflow and browser errors.

## Browser evidence and limits

Actual local Next app inspected in a separate headless Chrome context at `http://127.0.0.1:3019`. The final pass used the production build, the existing E2E fixture's real UI signin, and the **Open reader app** button. Only the ignored localhost `BETA_LOCK` rollout flag was disabled by the root agent; normal authentication and admin roles remained enforced. No membership, role, content, purchase, subscription or reading-preference changes were submitted.

| Screens | Widths / themes | Actual result |
| --- | --- | --- |
| `/reader/authors` | 390 and 1440; light and dark | Earlier browser pass loaded the honest empty catalog, 0 horizontal overflow. Computed h1 font is Montserrat Alternates. |
| `/reader/genres` | 390 and 1440; light and dark | Earlier browser pass loaded the honest empty catalog, 0 horizontal overflow. Language controls were moved below the heading following desktop review. |
| `/reader/library` | 1440 light and 390 dark | Final production pass remained on the requested route, 200, **Your books** heading and actual empty library. 0 horizontal overflow. |
| `/reader/discover` | 1440 light, English and Swedish; 390 dark, English | Final production pass remained on the requested route, 200, **Discover books** heading and accurate empty-language catalog. 0 horizontal overflow. |
| `/reader/home` | 390 and 1440 dark | Final integrated-build recheck reached **Welcome, E2E** at the exact requested URL. Honest **Your reading space** empty state, no featured-cover placeholder and no duplicate discovery action. 0 horizontal overflow. |
| `/reader/profile` | 390 dark | Final production pass reached **Your reader space**, genuine fixture profile and zero activity. 0 horizontal overflow. |
| `/reader/settings` | 390 and 1440 dark | Final integrated-build recheck reached **Reading preferences** at the exact requested URL. Shell-aligned heading and cards, no inset background block. Both labelled ranges remain within their containers (mobile widths 152.8px and 175.5px). Existing font/theme/size choices retained; no preferences changed. |
| `/reader/notifications`, `/reader/orders`, `/reader/inbox`, `/reader/feed`, `/reader/polls`, `/reader/clubs` | 390 dark | Final production pass reached each requested route and its correct heading, 200, 0 horizontal overflow. Inbox screenshot captures the initial loading state; no conversation/request interaction performed. Feed/polls/clubs retain their existing unavailable states. |
| `/reader/books/[id]` | 1440 light and 390 dark | The real owner draft linked from the author dashboard returned the intended **A page turned elsewhere.** not-found view; no publication or access state changed. This is denial-state coverage, **not populated book-detail coverage**. |
| `/reader/read/[chapterId]` | — | No chapter link available in the empty reader library/catalog. Populated prose and interactive reading-panel browser coverage could not be established from this fixture. Existing reader helper tests pass; source preserves custom fonts/themes/prose. |
| `/admin` | 390 dark | Existing non-admin fixture was redirected to `/author/home`, **Dashboard** heading. This verifies actual role denial. No authorized admin screenshot or mutation claimed. |

The final authenticated pass recorded **zero browser page errors** and **zero horizontal overflow** on every visited reader page. It used the `reduce` motion preference. Computed headings use Montserrat Alternates. The global theme control's bottom was `812px`, above mobile navigation top `818.5px` in the 390×900 viewport, confirming that the shared bottom-navigation collision was resolved.

Computed backgrounds from the earlier public checks: light `rgb(251, 250, 249)`; dark `rgb(23, 19, 29)`. Evidence lives in `/private/tmp/verkli-reader-brand-qa/`: `report-final.json`, `final-library-1440-light.png`, `final-library-390-dark.png`, `final-home-390-dark.png`, `final-profile-390-dark.png`, `final-settings-390-dark.png`, `final-discover-390-dark.png`, and the route-named screenshots. Those initial Home/settings images are superseded by `verified-home-390-dark.png`, `verified-home-1440-dark.png`, `verified-settings-390-dark.png` (full page), and `verified-settings-1440-dark.png`. `report-final-polish.json` records this final integrated-build recheck: exact URLs, 200 responses, correct headings, dark theme, honest empty-state assertions, contained ranges and zero browser page errors/overflow at both widths. No source change was needed after this pass. Earlier author/genre screenshots remain in the same directory.

The initial production pass with `BETA_LOCK=true` successfully authenticated, then redirected all protected views to `/waitlist`. That distinct rollout-gate evidence is retained in `report-beta-gate.json`; it is superseded for reader rendering coverage by the legitimate final pass above. No credentials or session tokens are included in this report. Empty catalog and lack of an admin fixture remain explicit limits; no book was published or access granted for screenshots.

## Exact implementation files

80 implementation/test files changed in the owned scopes; the coverage document is additional.

- `apps/web/src/app/(app-reader)/error.tsx`
- `apps/web/src/app/(app-reader)/reader/bookmarks/loading.tsx`
- `apps/web/src/app/(app-reader)/reader/feed/loading.tsx`
- `apps/web/src/app/(app-reader)/reader/home/loading.tsx`
- `apps/web/src/app/(app-reader)/reader/notifications/page.tsx`
- `apps/web/src/app/(app-reader)/reader/orders/page.tsx`
- `apps/web/src/app/(app-reader)/reader/profile/loading.tsx`
- `apps/web/src/app/(app-reader)/reader/profile/page.tsx`
- `apps/web/src/app/(app-reader)/reader/settings/ReaderSettingsClient.tsx`
- `apps/web/src/app/(app-reader)/reader/settings/page.tsx`
- `apps/web/src/app/(reader-browse)/error.tsx`
- `apps/web/src/app/(reader-browse)/reader/authors/[id]/FollowAuthorButton.tsx`
- `apps/web/src/app/(reader-browse)/reader/authors/[id]/SubscribeAuthorButton.tsx`
- `apps/web/src/app/(reader-browse)/reader/authors/[id]/loading.tsx`
- `apps/web/src/app/(reader-browse)/reader/authors/[id]/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/authors/loading.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/BookReviewsSection.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/CommentsSection.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/DemoReaderFinale.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/OfflineSaveButton.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/OrderPhysicalCopyButton.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/PurchaseChapterButton.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/ReviewStars.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/StartReadingLink.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/pod/cancel/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/pod/success/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/purchase/cancel/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/books/[id]/purchase/success/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/discover/loading.tsx`
- `apps/web/src/app/(reader-browse)/reader/genres/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/lists/[slug]/loading.tsx`
- `apps/web/src/app/(reader-browse)/reader/lists/[slug]/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/onboarding/OnboardingFlow.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ChapterTopNavigator.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ReaderChapterClient.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/components/ReaderHighlightComposer.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/components/ReaderHighlightsPanel.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/components/ReaderSettingsPanel.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/writers/[id]/loading.tsx`
- `apps/web/src/app/admin/_components/admin-nav.tsx`
- `apps/web/src/app/admin/author-applications/page.tsx`
- `apps/web/src/app/admin/beta/page.tsx`
- `apps/web/src/app/admin/books/[id]/ChapterModerationList.tsx`
- `apps/web/src/app/admin/books/[id]/page.tsx`
- `apps/web/src/app/admin/books/page.tsx`
- `apps/web/src/app/admin/feedback/page.tsx`
- `apps/web/src/app/admin/layout.tsx`
- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/app/admin/queues/RetryFailedButton.tsx`
- `apps/web/src/app/admin/queues/page.tsx`
- `apps/web/src/app/admin/users/[id]/page.tsx`
- `apps/web/src/app/admin/users/page.tsx`
- `apps/web/src/components/clubs/BookClubCard.tsx`
- `apps/web/src/components/clubs/BookClubDetail.tsx`
- `apps/web/src/components/clubs/ClubChat.tsx`
- `apps/web/src/components/clubs/CreateClubDialog.tsx`
- `apps/web/src/components/messages/InboxClient.tsx`
- `apps/web/src/components/notifications/NotificationBell.tsx`
- `apps/web/src/components/notifications/NotificationDropdown.tsx`
- `apps/web/src/components/notifications/NotificationItem.tsx`
- `apps/web/src/components/polls/PollCard.tsx`
- `apps/web/src/components/polls/PollCreator.tsx`
- `apps/web/src/components/reader/AuthorCard.tsx`
- `apps/web/src/components/reader/BookCard.tsx`
- `apps/web/src/components/reader/BookSwipeCard.tsx`
- `apps/web/src/components/reader/EmptyState.tsx`
- `apps/web/src/components/reader/FreemiumGate.tsx`
- `apps/web/src/components/reader/GenreGrid.tsx`
- `apps/web/src/components/reader/ProfileCreditsSection.tsx`
- `apps/web/src/components/reader/Rail.tsx`
- `apps/web/src/components/reader/ReaderAppShell.test.tsx`
- `apps/web/src/components/reader/ReaderAppShell.tsx`
- `apps/web/src/features/reader/reader-book/ReaderBookPageView.tsx`
- `apps/web/src/features/reader/reader-discover/ReaderDiscoverPageView.tsx`
- `apps/web/src/features/reader/reader-home/ReaderHomePageView.tsx`
- `apps/web/src/features/reader/reader-library/ReaderLibraryPageView.tsx`
- `apps/web/src/features/reader/reader-reading/ReadingView.tsx`
