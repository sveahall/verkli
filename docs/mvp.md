# Verkli MVP Checklist

## Steg 0: Done Definition

Steg 0 är klart när:
- [x] Git branch `mvp` är skapad och aktiv
- [x] Denna MVP-checklista finns i `docs/mvp.md`
- [x] Alla required env-variabler är dokumenterade i `.env.example`
- [x] Env-validering finns på plats i `apps/web/src/lib/env.ts`
- [x] Validering körs i alla API routes som kräver env-variabler
- [x] Lokal `.env.local` finns med placeholders (ej committad)
- [x] Bygget går igenom utan env-errors

## MVP Scope

Verkli MVP fokuserar på tre huvudspår som måste fungera end-to-end:

### 1. Writer Spår
**Mål**: Författare kan skapa, redigera och publicera böcker

**Features**:
- [ ] Skapa ny bok
  - Input: titel, beskrivning
  - Auto-generera slug
  - Skapa default Chapter 1
- [ ] Redigera kapitel
  - Tiptap editor fungerar
  - Autosave (debounced)
  - Lägg till/ta bort kapitel
- [ ] Sätta cover
  - Upload cover image
  - Preview i editor
- [ ] Publicera bok
  - Validation (titel + minst 1 kapitel med innehåll)
  - Uppdatera status till PUBLISHED
  - Sätt published_at timestamp

**Teknisk implementation**:
- Route: `/writer/books` (lista)
- Route: `/writer/books/[id]` (editor)
- API: `POST /api/books` (create)
- API: `POST /api/books/[id]/publish` (publish)
- Storage bucket: `book-covers`

### 2. Reader Spår
**Mål**: Läsare kan upptäcka, läsa och spara progress

**Features**:
- [ ] Öppna publicerad bok
  - Fetch book med chapters från DB
  - Visa metadata (titel, författare, cover, beskrivning)
  - Lista alla kapitel
- [ ] Läsa kapitel
  - Readonly Tiptap renderer
  - Navigation mellan kapitel (prev/next)
- [ ] Progress sparas
  - Track currentChapter + progressPercent
  - Insert/update `readings` tabell
  - Återställ progress vid reload

**Teknisk implementation**:
- Route: `/reader/books/[id]` (book detail)
- Route: `/reader/read/[id]` (reading view)
- Komponent: `ReaderView.tsx` (ny)
- DB: `readings` tabell (finns redan)

### 3. AI Marketing Spår
**Mål**: Automatisk marknadsföring vid publicering

**Features**:
- [ ] Publish triggar kampanj
  - Webhook/event när bok publiceras
  - Skapa campaign-post i DB
- [ ] Minst 2 asset types genereras
  - Social media post (text)
  - Book promo image (bild via AI)
  - (Optional: Short video via RunwayML)
- [ ] Assets lagras i DB
  - Tabell: `marketing_assets`
  - Fields: campaign_id, type, content, status, created_at
- [ ] Assets syns i UI
  - Dashboard: `/writer/marketing`
  - Visa genererade assets per campaign
- [ ] Assets kan exporteras och schemaläggas
  - Download-knapp för varje asset
  - (Phase 2: Schedule publishing)

**Teknisk implementation**:
- API: `POST /api/books/[id]/publish` (trigger campaign)
- API: `POST /api/campaigns` (create campaign)
- Service: `lib/ai/generateMarketingAssets.ts` (ny)
- DB migration: `create_marketing_tables.sql` (ny)
- Route: `/writer/marketing` (connect to real data)

## Acceptance Criteria för MVP

### 1. Writer
- Kan skapa bok
- Kan redigera kapitel
- Kan sätta cover
- Kan publicera

### 2. Reader
- Kan öppna publicerad bok
- Kan läsa kapitel
- Progress sparas och återställs vid reload

### 3. AI Marketing
- Publish triggar kampanj
- Minst 2 asset types genereras automatiskt
- Assets lagras i DB och syns i UI
- Assets kan exporteras och schemaläggas i Verkli

## Tekniska Milstolpar

### Milestone 1: Core Infrastructure (Steg 0)
- [x] Env-variabler dokumenterade och validerade
- [ ] Databas migrations körda i Supabase
- [ ] Storage buckets skapade (`book-covers`, `avatars`, `chapter-media`)
- [ ] Resend konfigurerat och testat

### Milestone 2: Writer Flow (Steg 1-4)
- [ ] Book creation fungerar
- [ ] Editor med autosave fungerar
- [ ] Cover upload fungerar
- [ ] Publish workflow komplett

### Milestone 3: Reader Flow (Steg 5-8)
- [ ] Book detail page fungerar
- [ ] Reading view med progress fungerar
- [ ] Reader home visar faktisk data

### Milestone 4: AI Marketing (Steg 9-10)
- [ ] Marketing tables skapade
- [ ] AI asset generation implementerad
- [ ] Marketing dashboard kopplas till real data
- [ ] Export/download fungerar

## Ej i MVP Scope

Följande features är **out of scope** för MVP:

- Shelves/library organization (backend finns, UI skippad)
- Reviews & ratings
- Social features (follows, likes, comments)
- Search & discovery algorithms
- Author profiles (public)
- Payment/monetization
- Mobile app
- Real-time collaboration
- Advanced analytics
- Email marketing automation
- Multi-language support

---

**Status**: Steg 0 klar ✅  
**Nästa steg**: Milestone 1 (databas setup)  
**Uppdaterad**: 2026-01-31
