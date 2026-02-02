# Import pipeline (books)

## Översikt

- **POST /api/books/import** – multipart file upload, skapar import-record, enqueue:ar extract-job.
- **GET /api/books/imports** – lista imports för inloggad användare.
- **GET /api/books/imports/[id]** – status, progress, error för en import.
- Worker: BullMQ-jobbet `extract` extraherar kapitel från epub/docx/html/txt och skapar book + chapters (med `source_text` och `content_hash`).

## Env-variabler

| Variabel | Krävs | Beskrivning |
|----------|--------|-------------|
| `REDIS_URL` | För kö | Redis-URL för BullMQ (t.ex. `redis://localhost:6379`). Om ej satt skapas import-record men inget jobb körs förrän worker startas med Redis. |
| `LOCAL_IMPORTS_DIR` | Nej | Katalog för uppladdade filer när Supabase Storage inte används (default: `.uploads/imports` under app root). |
| `NEXT_PUBLIC_TRANSLATIONS_ENABLED` | Nej | `false` → UI visar "Coming soon" för Translations; import fungerar som vanligt. Default: `true`. |

Övriga env (Supabase, m.m.) enligt `.env.example`. Worker använder samma `.env.local` (inkl. `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) för att uppdatera DB och för Supabase Storage-nedladdning.

## Storage

- Om Supabase-bucketen `book_imports` finns används den för uppladdade filer.
- Annars sparas filer lokalt (dev) i `LOCAL_IMPORTS_DIR` (eller `.uploads/imports`).

## Lokal utveckling (Redis + worker)

1. **Starta Redis** (repo root):  
   `docker compose up -d`  
   (använder `docker-compose.yml` i repo root: redis:7, port 6379.)

2. **Sätt REDIS_URL** i `apps/web/.env.local`:  
   `REDIS_URL=redis://localhost:6379`

3. **Kör workern** från `apps/web`:  
   `npm run import-worker`

- Om `REDIS_URL` saknas: API skapar fortfarande import-record men enqueue körs inte; tydlig logg i API och queue.
- Worker loggar: worker started, job received, extracting file, creating book, creating chapters, completed (eller failed med error_message i `book_imports`).
- Status: `pending` → `extracting` → `completed` eller `failed`; progress uppdateras under körning.

## Migreringar

Kör migreringar så att tabellerna finns:

- `book_imports`
- `chapters.source_text`, `chapters.content_hash`
- `translations` (minimal)

Fil: `apps/web/supabase/migrations/20250211000000_imports_and_chapter_source.sql`.

## Format

- **epub** – via paketet `epub` (Node).
- **docx** – mammoth (raw text), sedan heuristisk kapitel-split.
- **html** – cheerio, headings + paragraphs.
- **txt** – heuristisk split på Chapter/Part/Kapitel.

Kapitel sparas med `source_text` och `content_hash` (sha256 av source_text).
