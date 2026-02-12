# i18n migration guide

This folder introduces an i18n baseline without changing existing components.

## Scan method

Hardcoded UI strings were inventoried via repository scan (`rg`) across `apps/web/src/app`, `apps/web/src/components`, and `apps/web/src/lib`.

## Files with hardcoded strings

### Auth

- apps/web/src/app/(auth)/signin/page.tsx
- apps/web/src/app/(auth)/signup/page.tsx
- apps/web/src/app/(auth)/forgot-password/page.tsx
- apps/web/src/app/(auth)/author/signin/page.tsx
- apps/web/src/app/(auth)/author/signup/page.tsx
- apps/web/src/app/(auth)/author/forgot-password/page.tsx
- apps/web/src/app/(auth)/reader/signin/page.tsx
- apps/web/src/app/(auth)/reader/signup/page.tsx
- apps/web/src/app/(auth)/reader/forgot-password/page.tsx
- apps/web/src/app/auth/reset-password/page.tsx

### Reader (browse + app)

- apps/web/src/app/(reader-browse)/reader/discover/page.tsx
- apps/web/src/app/(reader-browse)/reader/genres/page.tsx
- apps/web/src/app/(reader-browse)/reader/lists/[slug]/page.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/page.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/loading.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/error.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/BookReviewsSection.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/CommentsSection.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/PurchaseBookButton.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/OfflineSaveButton.tsx
- apps/web/src/app/(reader-browse)/reader/books/[id]/BookmarkButton.tsx
- apps/web/src/app/(reader-browse)/reader/onboarding/OnboardingFlow.tsx
- apps/web/src/app/(reader-browse)/reader/onboarding/page.tsx
- apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ReaderChapterClient.tsx
- apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ReadingProgress.tsx
- apps/web/src/app/(reader-browse)/reader/authors/[id]/page.tsx
- apps/web/src/app/(reader-browse)/reader/authors/[id]/FollowAuthorButton.tsx
- apps/web/src/app/(app-reader)/reader/home/page.tsx
- apps/web/src/app/(app-reader)/reader/home/AuthorApplicationCard.tsx
- apps/web/src/app/(app-reader)/reader/bookmarks/page.tsx
- apps/web/src/app/(app-reader)/reader/library/ReaderLibraryClient.tsx
- apps/web/src/app/(app-reader)/reader/settings/ReaderSettingsClient.tsx
- apps/web/src/app/(app-reader)/reader/notifications/page.tsx
- apps/web/src/app/(app-reader)/reader/community/page.tsx
- apps/web/src/app/(app-reader)/reader/inbox/page.tsx
- apps/web/src/app/(public-reader)/reader/tts-demo/page.tsx

### Author

- apps/web/src/app/(app-author)/author/books/page.tsx
- apps/web/src/app/(app-author)/author/books/BookListClient.tsx
- apps/web/src/app/(app-author)/author/books/CreateBookForm.tsx
- apps/web/src/app/(app-author)/author/books/[id]/BookEditor.tsx
- apps/web/src/app/(app-author)/author/publish/page.tsx
- apps/web/src/app/(app-author)/author/profile/page.tsx
- apps/web/src/app/(app-author)/author/settings/page.tsx
- apps/web/src/app/(app-author)/author/dashboard/page.tsx
- apps/web/src/app/(app-author)/author/home/page.tsx
- apps/web/src/app/(app-author)/author/newsletters/NewslettersPageClient.tsx
- apps/web/src/app/(app-author)/author/polls/PollsPageClient.tsx
- apps/web/src/app/(app-author)/account/billing/page.tsx
- apps/web/src/app/(app-author)/account/feedback/page.tsx

### Community / notifications / messaging

- apps/web/src/app/(app-reader)/reader/clubs/ClubsPageClient.tsx
- apps/web/src/components/messages/InboxClient.tsx
- apps/web/src/components/messages/StartConversationComposer.tsx
- apps/web/src/components/notifications/NotificationBell.tsx
- apps/web/src/components/notifications/NotificationDropdown.tsx
- apps/web/src/components/notifications/NotificationItem.tsx
- apps/web/src/components/polls/PollCard.tsx
- apps/web/src/components/polls/PollCreator.tsx

### Shared components and public pages

- apps/web/src/app/global-error.tsx
- apps/web/src/app/error.tsx
- apps/web/src/app/not-found.tsx
- apps/web/src/components/books/CreateBookDialog.tsx
- apps/web/src/components/books/GenreSelector.tsx
- apps/web/src/components/books/JobStatusBanner.tsx
- apps/web/src/components/import/ImportBookModal.tsx
- apps/web/src/components/navbar/GlobalNavbar.tsx
- apps/web/src/components/navbar/UserMenu.tsx
- apps/web/src/components/ui/ErrorBanner.tsx
- apps/web/src/components/translations/TranslationPanel.tsx
- apps/web/src/components/translations/TranslationStatusBadge.tsx
- apps/web/src/components/newsletters/NewsletterComposer.tsx

### Lib-level text constants

- apps/web/src/lib/error-messages.ts
- apps/web/src/lib/sanitize-job-error.ts
- apps/web/src/lib/marketing/caption-generator.ts
- apps/web/src/lib/recommendations/enrichment.ts

## Migration example (before -> after)

### Before (hardcoded)

```tsx
<button>{isSaving ? 'Sparar...' : 'Spara'}</button>
```

### After (useT)

```tsx
'use client';

import { useT } from '@/lib/i18n/use-translations';

export function SaveButton({ isSaving }: { isSaving: boolean }) {
  const t = useT();
  return <button>{isSaving ? t('common.actions.saving') : t('common.actions.save')}</button>;
}
```

## Suggested migration order

1. Start with global/shared strings (`common.*`, `errors.*`).
2. Migrate auth flows (`auth.*`) to reduce duplicated login/signup copy.
3. Migrate reader experience (`reader.*`), then author/editor (`author.*`).
4. Migrate community, billing, referrals, and donations last.
