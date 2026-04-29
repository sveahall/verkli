# Verkli MVP – Launch status

**Status: MVP READY**

Verkli är en självpubliceringsplattform där **translations och discovery** är det primära värdet, med **audiobook automation** och **AI marketing** inbyggda i workflowet som tydliga steg men inte fullt realiserade motorer. MVP kännas komplett för användaren och kan lanseras publikt.

---

## Language system

- **Central config:** `apps/web/src/lib/languages.ts` – typed list (en, es, fr, de, it, pt), display names, SEO labels; helpers `getLanguageLabel`, `getSeoLanguageLabel`, `normalizeLanguage`, `isSupportedLanguage`.
- **Normalize fallback:** `book.language` null eller okänt → `normalizeLanguage()` returnerar `"en"` överallt (metadata, badge, API create).
- **SEO labels:** Metadata title/description använder `getSeoLanguageLabel()` (t.ex. "in Spanish") för konsekvent språktext.

---

## Användarflöde

Create → write → language → cover → publish → discover → read

- **author:** Skapa bok (språkval, original-URL) → skriv kapitel → sätt cover → publicera översättning → audiobook-steg (UI) → marketing (generera launch copy, delningslänkar).
- **Reader:** Upptäck böcker → bokdetalj (språkbadge, "Read in X on Verkli", länk till original) → läsa kapitel med sparad progress.

---

## Vad MVP är

- **Språk som förstaklass-koncept:** `books.language`, `original_source`, `original_url`; språkval vid skapande; original "på Amazon"-länk.
- **author-flöde:** Skapa bok med språk och valfritt original-URL; redigera kapitel; cover-upload; "Publish your translation"; Original- och Audiobook-steg i sidomenyn; Marketing med "Generate launch copy" (mock från titel + språk) och delningslänkar (Reader URL, copy redo att posta).
- **Reader-upplevelse:** Bokdetalj med språkbadge, "Read in [språk] on Verkli", länk till original om URL finns; SEO: titel "[Boktitel] in [språk]", språkfokuserad meta description.
- **Audiobook:** UI-steg "Audiobook ready" med copy "Audiobook generation is automated after publishing" – ingen faktisk TTS; kommentarer i kod för framtida hook.
- **AI marketing:** Sektion i author-UI med "Generate launch copy" (enkel text från titel + språk, mock) och delningslänkar (Reader URL, copy till urklipp).

---

## Vad som är "automated but rolling out"

- **Audiobook:** Presenteras som automatiskt efter publicering; motor (TTS) kommer i senare fas.
- **Launch copy:** Genereras i UI från titel + språk; framtida AI-integration kan kopplas in utan att ändra UX.

---

## Vad som medvetet inte ingår i MVP

- Externa API-integrationer (TTS, AI-API:er).
- Tunga AI-pipelines eller nya komplexa backend-system.
- Reviews, betalning, sök, shelves-UI utöver befintligt.
- Faktisk TTS för audiobook eller extern marketing-automation.

---

## Required env vars

- **Public (client + server):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Server only:** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL` (see `apps/web/src/lib/env.ts`; `assertServerEnv` used in some API routes)
- **Feature flags (optional, default = enabled):**  
  `NEXT_PUBLIC_TRANSLATIONS_ENABLED`, `NEXT_PUBLIC_AUDIOBOOK_ENABLED`, `NEXT_PUBLIC_MARKETING_ENABLED`, `NEXT_PUBLIC_DISCOVERY_ENABLED`  
  Set to `"false"` to disable. Unset = `true`.

---

## Required buckets (Supabase Storage)

- **book_covers** – book cover images (path: `{userId}/{bookId}/cover.{ext}`)
- **avatars** – user avatars (path: `{userId}/avatar.{ext}`); optional env `NEXT_PUBLIC_AVATARS_BUCKET_PUBLIC` for public vs signed URLs
- **chapter-media** – inline media in chapters (path: `{bookId}/{chapterId}/{timestamp}.{ext}`)

---

## Migration order (apps/web/supabase/migrations)

Kör i filnamnsordning (timestamp i prefix):

1. `20250101000000_books_and_chapters.sql` – books, chapters
2. `20250130000000_waitlist.sql` – waitlist (om använd)
3. `20250130100000_reader_waitlist.sql` – reader waitlist (om använd)
4. `20250201000000_readings_schema.sql` – readings
5. `20250201100000_books_language_and_original.sql` – language, original_source, original_url
6. `20250202000000_books_translation_pipeline.sql` – is_translation, original_book_id, translation_status
7. `20250203000000_books_audiobook_pipeline.sql` – audiobook_status, audiobook_assets, RLS
8. `20250204000000_marketing_campaigns.sql` – marketing_campaigns, RLS
9. `20250205000000_discovery_engine.sql` – is_featured, featured_rank, featured_until, curated_lists, curated_list_items, RLS

**Ingen beroende på `public.users` eller `public.reviews`** – appen använder endast `profiles` och `auth.users` för roll; alla migrations i apps/web är självständiga.

---

## Feature flags (apps/web/src/lib/flags.ts)

| Flag | Env (client + server) | Default | Effekt när `false` |
|------|------------------------|---------|---------------------|
| Translations | `NEXT_PUBLIC_TRANSLATIONS_ENABLED` | `true` | Translation-sektion dold i BookEditor och dashboard |
| Audiobook | `NEXT_PUBLIC_AUDIOBOOK_ENABLED` | `true` | Audiobook-sektion och knappar dolda; API `/api/books/[id]/audiobook/generate` → 403 |
| Marketing | `NEXT_PUBLIC_MARKETING_ENABLED` | `true` | Marketing-sektion och knappar dolda; API `/api/books/[id]/marketing/generate` → 403 |
| Discovery | `NEXT_PUBLIC_DISCOVERY_ENABLED` | `true` | Featured / New / Curated listor dolda på discover; endast Public authors kvar |

---

## Fresh DB setup (checklist)

1. Skapa Supabase-projekt och kopiera URL + anon key (+ service role för server).
2. Skapa storage buckets: `book_covers`, `avatars`, `chapter-media` (public eller RLS efter behov).
3. Kör alla migrations i `apps/web/supabase/migrations` i filnamnsordning.
4. Sätt required env vars (minst `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; övriga enligt env.ts).
5. (Valfritt) Sätt feature flags till `"false"` för att stänga av translations/audiobook/marketing/discovery.
6. Verifiera: skapa bok, ladda upp cover, publicera – inga fel från saknade tabeller eller triggers.
