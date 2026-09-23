# Author workspace brand coverage — 2026-09-10

The approved public author landing components are unchanged. Authenticated author views use the same warm paper, ink, Montserrat Alternates headings and violet/rose/apricot family as the landing. No schema, dependency, routing, permission, payment, persisted content, reader/editor preference, or demo-flag changes.

## What changed

- AuthorAppShell and AuthorSidebar: fixed dark plum desktop/mobile chrome, 236px sidebar, rose active markers, explicit active-page semantics and 40–44px navigation targets. Dark sidebar variables are scoped to `data-author-sidebar` inside the author shell, leaving shared token ownership with root.
- WorkspaceLayout and header actions: consistent padded header/canvas, neutral hairlines, 44px search, preserved responsive assistant dock.
- Page titles and section headings: explicit scoped display classes. Manuscript typeface and all author-selected typography remain untouched.
- Dashboard/library: restrained metric tones, tabular data, bordered cards, editorial cover placeholders, useful empty-state copy, clear library action from empty analytics.
- All editor panel families and the book layout wrapper: semantic surfaces/text/borders, primary foreground contrast in both themes, unchanged production/status semantics. The workflow stepper scrolls locally on narrow screens; the text toolbar scrolls within its row; side panel and status bar stack/wrap on mobile. The book-title header uses two rows on mobile, and switch thumbs stay visible in dark mode.
- Profile/settings/audience/marketing/stats/notifications/voices/publish/shelves/newsletters/polls: their own card, control, empty-state and page-frame styles migrated. Shared notifications/messages/polls handled by reader agent.
- Shared billing: consistent paper plan cards, true lists, aligned plan actions, 44px rounded controls, mobile-safe loading skeleton. Reader billing receives the same shared component changes.
- Legacy authenticated AuthorDashboard and components/library are included because AuthorLandingPage references that dashboard for signed-in visitors. Approved public landing/story/butterfly/data files are not edited.

## Route audit

All 35 author page entries were traced through route wrappers, redirects and shared rendering components.

| Route | Rendering coverage |
| --- | --- |
| `/account/billing` | Existing redirect retained; destination uses author shell/workspace. |
| `/account/feedback` | Author shell, shared semantic page controls and page title. |
| `/author/analytics/[metric]` | AnalyticsWorkspace / MetricDetailWorkspace and AnalyticsCharts. |
| `/author/analytics` | AnalyticsWorkspace / MetricDetailWorkspace and AnalyticsCharts. |
| `/author/audience` | AudienceWorkspace / MarketingPortalView / CampaignDetailView / CampaignWizard. |
| `/author/billing` | Shared BillingPageContent + BillingPageClient, payouts page. |
| `/author/billing/payouts` | Shared BillingPageContent + BillingPageClient, payouts page. |
| `/author/books/[id]/analytics` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/books/[id]/marketing` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/books/[id]/overview` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/books/[id]` | BookEditorView, workflow stepper, manuscript, production/publishing panels. |
| `/author/books/[id]/settings` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/books/[id]/write` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/books` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/dashboard` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/home` | HomeWorkspace, stats, books table, country sales and activity. |
| `/author/inbox` | Existing padded page frame; shared InboxClient handled by reader agent. |
| `/author/library/[id]` | Book overview, chapter list, language/audio empty states. |
| `/author/library` | LibraryWorkspace, continue editing, cover grid, create-book state. |
| `/author/marketing/[id]` | AudienceWorkspace / MarketingPortalView / CampaignDetailView / CampaignWizard. |
| `/author/marketing` | AudienceWorkspace / MarketingPortalView / CampaignDetailView / CampaignWizard. |
| `/author/newsletters/[id]` | Page frame, NewsletterList / NewsletterComposer. |
| `/author/newsletters` | Page frame, NewsletterList / NewsletterComposer. |
| `/author/notifications` | Page frame, notification list/empty state, pagination; shared items by reader agent. |
| `/author/polls` | Page frame, authored poll cards; shared PollCreator handled by reader agent. |
| `/author/production` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/profile` | ProfilePage; upload, profile visibility and form controls. |
| `/author/publish/[id]` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/publish` | Publishing library/list/empty state. |
| `/author/settings` | SettingsPage / SubscriptionPlanSection; account and publishing controls. |
| `/author/shelves/[id]` | Shelf overview and book cards, with author-chosen imagery preserved. |
| `/author/shelves` | Existing redirect retained; destination uses author shell/workspace. |
| `/author/stats` | AuthorStatsDashboard and stats cards/table. |
| `/author/voices` | Voice-library heading/empty state; VoiceList already uses semantic tokens. |
| `/author/write` | Existing redirect retained; destination uses author shell/workspace. |

## Validation

- Targeted ESLint over the full owned route/component families: passed.
- TypeScript `tsc --noEmit --pretty false -p apps/web/tsconfig.json`: passed at the integrated implementation checkpoints. Root confirmed the final integrated production build, full lint and 1,724 tests passed.
- 7 existing relevant test files, 66 tests passed: author command registry, demo hotkeys/service worker, analytics chart helpers, editor autosave scheduler, book tools and editor helpers.
- Browser QA uses real UI sign-in with the existing E2E fixture; no fixture creation/reset, no saved manuscript/profile changes, no generation, publishing, newsletter sending or payment actions.
- Browser checks completed with real fixture session at 1440px: Library, Analytics, Profile, Settings, Notifications and Inbox returned 200, rendered their actual headings and had document width equal to viewport width (1440px). Screenshots of Library, Settings and Profile were visually inspected and confirm the shared paper/plum treatment.
- Final built-preview browser pass used the same real author fixture and made 29 route visits. Every response was 200 and every final pathname matched the requested route. Every document width matched its 1440px or 390px viewport. There were zero page errors and zero intersections between the theme toggle and fixed bottom navigation.
- At 1440px, actual Home/Dashboard, Library, Billing/Subscription, Settings, manuscript editor, Cover, Audiobook, Pricing, Publish and Review panels rendered. Format side panel closed and reopened (`aria-pressed` false → true); Outline and Find views rendered without editing content. Home, Billing and Pricing were checked again in dark mode.
- At 390px, Home, Library, Settings and Billing rendered in light and dark mode; manuscript editor rendered in both. Cover, Audiobook, Pricing and Publish rendered in light mode. The stepper/toolbar and dashboard table scroll locally without widening the document. Theme control remains above the bottom navigation.
- Screenshot inspection found long book titles overlapping the Chapters label and Draft badge in the mobile manuscript header. The source now uses a two-row mobile grid, hides the unused spacer blocks, and constrains the title button. Targeted lint passed. Final built-preview regression passed at 390px: the title and parent are both 308px wide, its right edge is 349px, and document width is 390px. Light/mobile and dark/desktop screenshots confirm the final header and semantic editor background.
- Browser QA found that `?panel=translate` rendered blank with `getTranslationsEnabled()` false. The source now retains that guard and adds a neutral branded unavailable message plus Back to manuscript using the existing navigation handler. Final built-preview verification passed: the heading rendered and Back to manuscript restored both the actual book URL (without the translate query) and the `.ProseMirror` editor. No content was changed. The flag was not bypassed, so the enabled translation panel remains source-audited only. Audiobook visibly reports its existing worker-unavailable state; generation was not invoked.
- Initial preview access issues were configuration only: root supplied the guarded server configuration, then set `BETA_LOCK=false` in the ignored localhost environment for the final pass. Normal real authentication and role checks stayed enabled. No beta membership or role records changed.
- Final evidence log: `/tmp/verkli-author-prod-qa.log`. Screenshots use `/tmp/verkli-author-prod-*.png`, including `home-desktop`, `billing-desktop`, `billing-dark-mobile`, `library-dark-mobile`, `pricing-dark-desktop`, `editor-edit-desktop`, `editor-outline-desktop`, `editor-find-desktop`, `editor-cover-mobile`, `editor-audiobook-mobile` and `editor-publish-mobile`. The mobile editor screenshot preceding the title fix documents the identified defect and must not be treated as the post-fix rendering.
- Final regression evidence: `/tmp/verkli-author-final-check.log` (exit 0; zero page errors), `/tmp/verkli-author-final-editor-mobile.png`, `/tmp/verkli-author-final-translation-mobile.png`, `/tmp/verkli-author-final-editor-dark-mobile.png` and `/tmp/verkli-author-final-editor-dark-desktop.png`. Final path assertions cover Library, editor, disabled Translation and the return navigation.
- Earlier authenticated evidence is in `/tmp/verkli-author-library-desktop.png`, `/tmp/verkli-author-settings-desktop.png`, `/tmp/verkli-author-profile-desktop.png`, `/tmp/verkli-author-analytics-desktop.png`, `/tmp/verkli-author-notifications-desktop.png`, `/tmp/verkli-author-inbox-desktop.png`. Interrupted dev error-page screenshots for Voices/Publish/Newsletters are not UI evidence.
- Remaining coverage limits: dynamic campaign/newsletter/shelf details and feature-flagged screens were source-audited; no marketing/poll/newsletter flags were bypassed. No paid operations or persisted actions were exercised.

## QA script

1. Sign in with the existing author test account; open Home and Library, then inspect the existing fixture book without editing it.
2. Open each book workflow panel, check the toolbar/stepper and close/reopen the assistant or side panel without generating content.
3. Open analytics, profile, settings, billing, notifications and inbox; check labels, empty states and disabled/loading actions without saving.
4. Check newsletters/polls/marketing access follows the deployment flags; verify enabled screens retain their existing actions.
5. Repeat Library, editor, settings and billing at 390px; check local toolbar scrolling, bottom navigation and no document-wide horizontal overflow.
6. Toggle dark/light mode and use Tab through navigation, form fields and actions; ensure readable text and visible focus.

## Changed source files

- `apps/web/src/app/(app-author)/account/feedback/AccountFeedbackClient.tsx`
- `apps/web/src/app/(app-author)/author/audience/loading.tsx`
- `apps/web/src/app/(app-author)/author/billing/loading.tsx`
- `apps/web/src/app/(app-author)/author/billing/payouts/page.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/BookWorkflowHeader.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/layout.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/BookEditorPanelContent.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/BookEditorView.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/components/BookEditorStatusBanners.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/components/ChapterRail.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/components/EditorCanvas.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/components/ImportManusSection.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/AiAssistantPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/AudiobookPanel.components.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/AudiobookPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/CoverPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/DistributionFacade.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/MarketPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PricingPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PrintPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PrintPanel.views.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/ProductionFacade.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PublishPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/ReviewPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/StatisticsPanel.components.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/StatisticsPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/TrailerPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/TranslatePanel.components.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/TranslatePanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/TranslationCheckoutModal.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/views/BookDashboard.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/views/FocusModeEditorView.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/views/SimplifiedEditView.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/views/WriteOnlyWorkspaceView.tsx`
- `apps/web/src/app/(app-author)/author/dashboard/loading.tsx`
- `apps/web/src/app/(app-author)/author/home/loading.tsx`
- `apps/web/src/app/(app-author)/author/library/[id]/page.tsx`
- `apps/web/src/app/(app-author)/author/newsletters/NewslettersPageClient.tsx`
- `apps/web/src/app/(app-author)/author/newsletters/[id]/page.tsx`
- `apps/web/src/app/(app-author)/author/notifications/page.tsx`
- `apps/web/src/app/(app-author)/author/polls/PollsPageClient.tsx`
- `apps/web/src/app/(app-author)/author/production/loading.tsx`
- `apps/web/src/app/(app-author)/author/profile/loading.tsx`
- `apps/web/src/app/(app-author)/author/publish/loading.tsx`
- `apps/web/src/app/(app-author)/author/publish/page.tsx`
- `apps/web/src/app/(app-author)/author/shelves/[id]/loading.tsx`
- `apps/web/src/app/(app-author)/author/shelves/[id]/page.tsx`
- `apps/web/src/app/(app-author)/author/stats/loading.tsx`
- `apps/web/src/app/(app-author)/author/voices/page.tsx`
- `apps/web/src/app/(app-author)/author/write/loading.tsx`
- `apps/web/src/components/author/profile/ProfilePage.tsx`
- `apps/web/src/components/author/settings/SettingsPage.tsx`
- `apps/web/src/components/author/settings/SubscriptionPlanSection.tsx`
- `apps/web/src/components/author/stats/AuthorStatsDashboard.tsx`
- `apps/web/src/components/author/stats/StatsBookTable.tsx`
- `apps/web/src/components/author/stats/StatsEngagementCards.tsx`
- `apps/web/src/components/author/stats/StatsOverviewCards.tsx`
- `apps/web/src/components/billing/BillingPageClient.tsx`
- `apps/web/src/components/billing/BillingPageContent.tsx`
- `apps/web/src/components/books/CoverCropModal.tsx`
- `apps/web/src/components/books/CreateBookDialog.tsx`
- `apps/web/src/components/books/DeleteBookButton.tsx`
- `apps/web/src/components/books/GenreSelector.tsx`
- `apps/web/src/components/books/cover-editor/CoverEditorFilterPanel.tsx`
- `apps/web/src/components/books/cover-editor/CoverEditorModal.tsx`
- `apps/web/src/components/books/cover-editor/CoverEditorTextPanel.tsx`
- `apps/web/src/components/editor/CommandPalette.tsx`
- `apps/web/src/components/editor/EditorFindReplace.tsx`
- `apps/web/src/components/editor/EditorFormatPanel.tsx`
- `apps/web/src/components/editor/EditorOutlinePanel.tsx`
- `apps/web/src/components/editor/EditorSidePanel.tsx`
- `apps/web/src/components/editor/EditorStatusBar.tsx`
- `apps/web/src/components/editor/TiptapEditor.tsx`
- `apps/web/src/components/library/BookCard.tsx`
- `apps/web/src/components/library/ShelfTile.tsx`
- `apps/web/src/components/marketing/CampaignWizard.config.tsx`
- `apps/web/src/components/marketing/CampaignWizard.tsx`
- `apps/web/src/components/newsletters/NewsletterComposer.tsx`
- `apps/web/src/components/newsletters/NewsletterList.tsx`
- `apps/web/src/features/author-shell/AuthorAppShell.tsx`
- `apps/web/src/features/author-shell/AuthorSidebar.tsx`
- `apps/web/src/features/author-workspaces/WorkspaceLayout.tsx`
- `apps/web/src/features/author-workspaces/analytics/AnalyticsCharts.tsx`
- `apps/web/src/features/author-workspaces/analytics/AnalyticsWorkspace.tsx`
- `apps/web/src/features/author-workspaces/analytics/MetricDetailWorkspace.tsx`
- `apps/web/src/features/author-workspaces/audience/AudienceWorkspace.tsx`
- `apps/web/src/features/author-workspaces/components/WorkspaceHeaderActions.tsx`
- `apps/web/src/features/author-workspaces/home/HomeWorkspace.tsx`
- `apps/web/src/features/author-workspaces/home/components/ActivityList.tsx`
- `apps/web/src/features/author-workspaces/home/components/BooksTable.tsx`
- `apps/web/src/features/author-workspaces/home/components/CountrySalesCard.tsx`
- `apps/web/src/features/author-workspaces/home/components/StatsCard.tsx`
- `apps/web/src/features/author-workspaces/library/LibraryWorkspace.tsx`
- `apps/web/src/features/author-workspaces/marketing/CampaignDetailView.tsx`
- `apps/web/src/features/author-workspaces/marketing/MarketingPortalView.tsx`
- `apps/web/src/features/author-workspaces/write/WriteWorkspace.tsx`
- `apps/web/src/features/author/AuthorDashboard.tsx`
- `apps/web/src/features/book-workspace/ChapterRail.tsx`
- `apps/web/src/features/book-workspace/EditorCanvas.tsx`
- `apps/web/src/features/author-shell/AuthorAppShell.module.css`
