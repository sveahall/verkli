# Steg 1 MVP: Databas setup och migrations (utan Prisma)

Prisma används inte. All dataåtkomst sker via Supabase + RLS.

---

## A) Supabase CLI (utan brew)

```bash
npm i -g supabase
supabase --version
```

---

## B) Supabase config och migrations

**config.toml** finns inte i repot. Den skapas när du kör `supabase init` i apps/web.

**Migrations i ordning (kör i denna ordning):**

| Ordning | Fil | Beskrivning |
|--------|-----|-------------|
| 1 | packages/db: 00001_create_users_trigger.sql | handle_new_user, handle_user_update på auth.users; RLS users |
| 2 | packages/db: 00002_rls_policies.sql | RLS på books, chapters, readings, reviews |
| 3 | packages/db: 00003_create_shelves.sql | Tabeller shelves, shelf_sections, shelf_books + RLS + update_updated_at |
| 4 | packages/db: 00004_add_shelf_fields.sql | ALTER shelves (subtitle, cover_type, …) |
| 5 | packages/db: 00004_create_profiles.sql | Tabell profiles + RLS + public shelf-policies |
| 6 | packages/db: 00006_fix_chapters_rls.sql | RLS chapters (INSERT/UPDATE/DELETE) |
| 7 | apps/web: 20250130000000_waitlist.sql | Tabell waitlist + RLS |
| 8 | apps/web: 20250130100000_reader_waitlist.sql | Tabell reader_waitlist + RLS |

**Förutsättning:** Tabellerna `public.users`, `public.books`, `public.chapters`, `public.readings`, `public.reviews` måste finnas innan 00001/00002/00003. Om de inte finns (t.ex. nytt projekt), skapa dem en gång i SQL Editor från Supabase-schema eller tidigare Prisma-schema.

**Val:** Kör alla ovanstående migrations. De som ska köras är alla som listats (packages/db först, sedan apps/web).

---

## C) Länka projekt

Project ref = subdomänen i `NEXT_PUBLIC_SUPABASE_URL` (t.ex. `https://abc123.supabase.co` → ref = `abc123`).

```bash
cd apps/web
supabase init
supabase link --project-ref DITT_PROJECT_REF
```

---

## D) Köra migrations

**Säkraste och snabbaste:** Samla alla migrations under apps/web, sedan `supabase db push`.

1. Kopiera packages/db-migrations till apps/web:

```bash
cd /Users/admin/verkli-web
cp packages/db/supabase/migrations/00001_create_users_trigger.sql apps/web/supabase/migrations/
cp packages/db/supabase/migrations/00002_rls_policies.sql apps/web/supabase/migrations/
cp packages/db/supabase/migrations/00003_create_shelves.sql apps/web/supabase/migrations/
cp packages/db/supabase/migrations/00004_add_shelf_fields.sql apps/web/supabase/migrations/
cp packages/db/supabase/migrations/00004_create_profiles.sql apps/web/supabase/migrations/
cp packages/db/supabase/migrations/00006_fix_chapters_rls.sql apps/web/supabase/migrations/
```

2. Push:

```bash
cd apps/web
supabase db push
```

**Alternativ:** Kör varje fil manuellt i Supabase Dashboard → SQL Editor i ordningen ovan.

---

## E) Storage (MANUELLT)

Skapa buckets i Dashboard: **Storage → New bucket** för varje:

- **book-covers** (Public)
- **chapter-media** (Public)
- **avatars** (Public)

**Policies på storage.objects** – kör i SQL Editor (ersätt inte något):

```sql
-- Public read för alla tre buckets
CREATE POLICY "Public read book-covers"
ON storage.objects FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "Public read chapter-media"
ON storage.objects FOR SELECT USING (bucket_id = 'chapter-media');

CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated insert
CREATE POLICY "Authenticated insert book-covers"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "Authenticated insert chapter-media"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chapter-media');

CREATE POLICY "Authenticated insert avatars"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

-- Owner update/delete
CREATE POLICY "Owner update storage"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('book-covers','avatars','chapter-media') AND owner_id = auth.uid());

CREATE POLICY "Owner delete storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('book-covers','avatars','chapter-media') AND owner_id = auth.uid());
```

---

## F) Verifiering (MANUELLT)

**RLS:** Database → Tables → varje tabell → RLS ska vara Enabled på users, profiles, books, chapters, readings, reviews, shelves, shelf_sections, shelf_books, waitlist, reader_waitlist.

**Policies:** Samma ställe – kontrollera att policies finns och ser rimliga ut (SELECT/INSERT/UPDATE/DELETE enligt RLS-filerna).

**Triggers:**
- **handle_new_user** – på auth.users vid INSERT (on_auth_user_created).
- **handle_user_update** – på auth.users vid UPDATE (on_auth_user_updated).
- **update_updated_at_column** – på shelves, shelf_sections, shelf_books, profiles (och vid behov books, chapters, reviews om du har lagt till det).

---

## G) Smoke test

1. Starta: `npm run dev` (från repo root).
2. Signup writer (UI).
3. Verifiera: Table Editor → **public.users** och **public.profiles** – ny rad med samma id som i Authentication.
4. Skapa bok och chapter (UI eller SQL).
5. Testa upload (t.ex. cover eller chapter-media).

---

**Status:** Steg 1 redo när migrations är körda, buckets + storage-policies satta och smoke test grön.
