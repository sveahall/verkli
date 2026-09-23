# Job Pipeline — Regressionstest

> Kör detta testpaket **varje gång** ni ändrar i job pipeline, workers, köer
> eller job-relaterad UI.

## Förutsättningar

| Beroende | Startkommando |
|---|---|
| Redis | `docker compose up -d` |
| Supabase (lokal eller hosted) | se `.env.local` |
| Import worker | `npm run import-worker` |
| Translation worker | `npm run translate-worker` |
| Audiobook worker | `npm run audiobook-worker` |

---

## A. Import-jobb (4 testfall)

### A1 — Happy path: EPUB-import

| | |
|---|---|
| **Steg** | 1. Logga in som författare. 2. Gå till importflödet. 3. Ladda upp en giltig `.epub`-fil. |
| **Förväntat** | `book_imports.status` går `pending → extracting → completed`. Bok + kapitel skapas. Bannern visar "Import: Pågår" → "Import: Klar". |
| **Verifiering** | `SELECT status FROM book_imports ORDER BY created_at DESC LIMIT 1;` = `completed`. Kapitel-rad per chapter. |

### A2 — Ogiltig fil

| | |
|---|---|
| **Steg** | 1. Ladda upp en `.jpg` omdöpt till `.epub`. |
| **Förväntat** | `book_imports.status = 'failed'`, `error_message` innehåller felorsak. Banner visar "Import: Misslyckades" + "Något gick fel. Försök igen." |

### A3 — Dubblettimport (idempotens)

| | |
|---|---|
| **Steg** | 1. Importera samma bok igen (samma fil). |
| **Förväntat** | Worker skippar om kapitel redan finns för versionen. Ny `book_imports`-rad skapas men inga dubblettkapitel. |

### A4 — Import utan worker (Redis nere)

| | |
|---|---|
| **Steg** | 1. Stoppa Redis. 2. Ladda upp en fil via import. |
| **Förväntat** | API svarar 503 med `"Queue unavailable"`. `book_imports`-rad skapas (för retry när Redis startar). |

---

## B. Översättningsjobb (4 testfall)

### B1 — Happy path: Översätt sv → en

| | |
|---|---|
| **Steg** | 1. Öppna en bok med svenska kapitel. 2. Trigga översättning till engelska. |
| **Förväntat** | `book_versions.status` går `draft → translating → done`. Ny `book_version` med `language_code='en'` skapas. Banner visar "Översättning: Pågår" → "Översättning: Klar". |
| **Verifiering** | `SELECT status, language_code FROM book_versions WHERE book_id = '<id>' AND language_code = 'en';` = `done`. Kapitel har `source_text` fyllt. |

### B2 — Språk som inte stöds

| | |
|---|---|
| **Steg** | 1. Trigga översättning till ett språk utan modell (t.ex. `zh`). |
| **Förväntat** | Worker markerar versionen som `failed`. Felmeddelande loggas. Banner visar "Översättning: Misslyckades". |

### B3 — Översätt igen (re-trigger)

| | |
|---|---|
| **Steg** | 1. Trigga översättning sv → en igen efter en lyckad körning. |
| **Förväntat** | Worker upsertar kapitel (on conflict: `book_version_id, order`). Ingen dubblettdata. Status uppdateras korrekt. |

### B4 — Översättning av bok utan kapitel

| | |
|---|---|
| **Steg** | 1. Skapa en bok manuellt utan kapitel. 2. Trigga översättning. |
| **Förväntat** | Worker kastar fel, markerar version som `failed`. Logg visar att källversion saknar kapitel. |

---

## C. Ljudboksgenerering (4 testfall)

### C1 — Happy path: Generera ljudbok

| | |
|---|---|
| **Steg** | 1. Öppna en bok med kapitel. 2. Klicka "Generera ljudbok". |
| **Förväntat** | `ai_jobs.status` går `pending → processing → completed`. `audiobook_assets`-rad skapas med `status='generated'`. `books.audiobook_status` uppdateras till `published` (trigger). Banner visar progressbar med "3 / 8 kapitel". |
| **Verifiering** | `SELECT status FROM ai_jobs WHERE kind='audiobook_generation' AND book_id='<id>' ORDER BY created_at DESC LIMIT 1;` = `completed`. |

### C2 — Dubbeltrigger (jobb redan pågår)

| | |
|---|---|
| **Steg** | 1. Trigga ljudboksgenerering. 2. Trigga igen medan jobbet körs. |
| **Förväntat** | Andra anropet returnerar `{ ok: true, message: "Job already in progress" }` med befintligt jobb-ID. Inget nytt jobb skapas. |

### C3 — Ljudbok utan kapitel

| | |
|---|---|
| **Steg** | 1. Skapa bok utan kapitel. 2. POST till `/api/books/<id>/audiobook/generate`. |
| **Förväntat** | API svarar 400: `"No chapters found for this book version"`. Inget `ai_jobs`-rad skapas. |

### C4 — Ljudbok med cache-träff

| | |
|---|---|
| **Steg** | 1. Generera ljudbok. 2. Ta bort `audiobook_assets` men behåll `chapter_audio_cache`. 3. Generera igen. |
| **Förväntat** | Worker hittar cache i `chapter_audio_cache` (via `content_hash + voice_id + model_path`). TTS-syntes hoppas över för cachade kapitel. Snabbare körning. |

---

## D. Unified Job-status API & UI (4 testfall)

### D1 — GET /api/books/:id/jobs returnerar alla jobbtyper

| | |
|---|---|
| **Steg** | 1. Trigga import, översättning och ljudbok för samma bok. 2. GET `/api/books/<id>/jobs`. |
| **Förväntat** | Response innehåller alla tre jobbtyper. `activeCount` stämmer med antal `pending/processing`. `summary` har nycklar `import`, `translation`, `audiobook`. |

### D2 — Polling startar och stannar korrekt

| | |
|---|---|
| **Steg** | 1. Starta ett jobb. 2. Öppna bokredigeraren (BookEditor). 3. Övervaka nätverksfliken. |
| **Förväntat** | Nätverksanrop till `/api/books/<id>/jobs` var 5:e sekund medan `activeCount > 0`. Polling **stannar** när alla jobb är klara. `settled`-flagga sätts = `true` (triggar `router.refresh()`). |

### D3 — BookJobsBanner visar rätt antal aktiva jobb

| | |
|---|---|
| **Steg** | 1. Ha två pågående jobb (t.ex. import + ljudbok). 2. Observera bannern. |
| **Förväntat** | Två separata banners visas med korrekta etiketter ("Import: Pågår", "Ljudbok: Pågår"). Banners försvinner 5 min efter att jobben avslutats. |

### D4 — Legacy audiobook/status-endpoint fortfarande fungerar

| | |
|---|---|
| **Steg** | 1. Generera en ljudbok. 2. GET `/api/books/<id>/audiobook/status`. |
| **Förväntat** | Response har `bookStatus`, `job` (med progress-data), och `asset` (om genererad). Backwards-kompatibel med äldre kod. |

---

## E. Stuck-jobb & Retry (4 testfall)

### E1 — Stuck job: Worker dör under processing

| | |
|---|---|
| **Repro** | 1. Starta ett ljudboksjobb. 2. Döda workern (`kill -9 <pid>`) medan jobbet är `processing`. |
| **Tillstånd efter** | `ai_jobs.status` = `processing`, `started_at` satt, ingen `finished_at`. Redis-jobbet i `active` state. |
| **UI-beteende** | Banner visar "Ljudbok: Pågår" initialt. Efter **30 minuter** utan progress → banner visar **"Misslyckades"** med meddelande **"Uppgiften verkar ha fastnat. Försök igen."** (klientside stale-detection i `getVisibleJobs()`). |
| **API-beteende** | `GET /api/books/<id>/jobs` returnerar jobbet med `status: "processing"` (oförändrat i DB). Klienten konverterar det till `failed` efter 30 min. |
| **Verifiering** | `SELECT id, status, started_at, finished_at FROM ai_jobs WHERE kind='audiobook_generation' AND status='processing' AND finished_at IS NULL;` |

### E2 — Stuck job: Redis nere vid enqueue

| | |
|---|---|
| **Repro** | 1. Stoppa Redis. 2. Trigga ljudboksgenerering via API. |
| **Tillstånd efter** | `ai_jobs`-rad skapas med `status='failed'` och `error='Queue unavailable'`. |
| **UI-beteende** | API returnerar 503: `"Queue unavailable. Ensure REDIS_URL is set and Redis is running."` Banner visar "Ljudbok: Misslyckades". |
| **Recovery** | 1. Starta Redis. 2. Trigga generering igen → nytt jobb skapas och köas normalt. |

### E3 — Retry efter misslyckat jobb

| | |
|---|---|
| **Repro** | 1. Framkalla ett `failed` ljudboksjobb (t.ex. via E1 eller ogiltigt TTS-model-path). 2. POST `/api/books/<id>/audiobook/generate` igen. |
| **Förväntat** | Nytt `ai_jobs`-rad skapas (det gamla har `status='failed'`, inte `pending/processing`). Worker plockar upp det nya jobbet. Banner byter från "Misslyckades" till "Köad" → "Pågår" → "Klar". |
| **Verifiering** | `SELECT id, status FROM ai_jobs WHERE kind='audiobook_generation' AND book_id='<id>' ORDER BY created_at DESC LIMIT 2;` — ska visa `completed` (nytt) och `failed` (gammalt). |
| **Hur vet man att retry funkade?** | 1. Nytt jobb-ID != gammalt jobb-ID. 2. Nytt jobb har `status='completed'`. 3. `audiobook_assets`-rad finns med `audio_url`. 4. `books.audiobook_status = 'published'`. 5. Banner visar "Ljudbok: Klar". |

### E4 — BullMQ automatisk retry (2 försök)

| | |
|---|---|
| **Repro** | 1. Simulera ett transient fel i worker (t.ex. tillfälligt oåtkomlig narrator-provider). |
| **Förväntat** | BullMQ kör attempt 1, det misslyckas. Väntar 2 sekunder (exponential backoff). Kör attempt 2. Om attempt 2 lyckas → `status='completed'`. Om attempt 2 misslyckas → `status='failed'` permanent. |
| **UI-beteende** | Under retry: jobbet står kvar som `processing`. Användaren ser ingen skillnad förrän det slutgiltigt lyckas eller misslyckas. |
| **Verifiering** | Worker-loggar visar `attempt: 1` och `attempt: 2`. `ai_jobs.error` innehåller felmedelande från sista försöket om det misslyckas. |

---

## Sammanfattning: Stuck-jobb lifecycle

```
┌─────────┐   enqueue   ┌───────────┐   worker picks up   ┌────────────┐
│ pending │ ──────────→ │ processing │ ───────────────────→ │ completed  │
└─────────┘             └───────────┘                      └────────────┘
     │                       │
     │ Redis nere            │ Worker dör / fel
     ▼                       ▼
┌──────────┐          ┌──────────┐
│  failed  │          │  failed  │ ← efter BullMQ retries
│  (503)   │          │          │   eller 30 min stale-detect
└──────────┘          └──────────┘
                           │
                           │ Användaren triggar igen
                           ▼
                      ┌─────────┐
                      │ NYTT    │ (ny ai_jobs-rad)
                      │ pending │
                      └─────────┘
```

## Stuck-jobb detection sammanfattning

| Mekanism | Var | Timeout | Resultat |
|---|---|---|---|
| BullMQ retry | Worker | 2 attempts, 2s backoff | `failed` i DB om båda misslyckas |
| Stale-detect (klient) | `JobStatusBanner.tsx` → `getVisibleJobs()` | 30 min | Banner visar "Misslyckades" + "Uppgiften verkar ha fastnat. Försök igen." |
| Completed/failed fadeout | `JobStatusBanner.tsx` → `getVisibleJobs()` | 5 min | Banner göms efter 5 min |

---

## Checklista per release

- [ ] A1–A4: Import-jobb
- [ ] B1–B4: Översättningsjobb
- [ ] C1–C4: Ljudboksgenerering
- [ ] D1–D4: Unified API & UI
- [ ] E1–E4: Stuck-jobb & Retry

### Release-noter: DB migrations
- `job_status_view` körs med `security_invoker = on` (migration `20260208010000`). Viewen respekterar RLS på underliggande tabeller — varje användare ser bara sina egna jobb.
