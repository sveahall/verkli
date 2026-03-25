# FAS 5: Användarloopen i prod

## Översikt

- **Beta gating**: När `BETA_LOCK=true` får endast användare med `beta_enabled` i `user_flags` komma åt appen. Övriga redirectas till `/waitlist` (sidor) eller får 403 (API).
- **Feedback**: Användare kan skicka bug/idea/other via POST; egna feedback visas med status. Admin listar all feedback via autentiserad admin-session.
- **Funnel metrics**: Admin-endpoint som räknar events senaste 7 dagar per event_name, uppdelat author/reader.
- Inga mockar; allt använder Supabase.

---

## Env

```bash
# Beta lock (FAS 5): när true, endast beta-användare och /waitlist, /auth tillåtna
# BETA_LOCK=false

# Admin API (feedback, funnel) använder Supabase-session + `profiles.role = 'admin'`
```

---

## Beta gating

- **Tabell**: `public.user_flags` (user_id, beta_enabled, created_at). RLS: användare SELECT egen rad; skriv via service role.
- **Helper**: `lib/auth/beta.ts` – `isBetaUser(supabase, userId)`.
- **Middleware**: Om `BETA_LOCK=true` och användaren inte har `beta_enabled`:
  - Tillåtna paths: `/waitlist`, `/auth`, `/api/waitlist`, `/api/auth`, `/_next`, statiska filer.
  - API (t.ex. `/api/books`): 403 med `{ error: "Beta access required" }`.
  - Sidor: redirect 307 till `/waitlist`.

### Sätt beta för en användare

Via Supabase (service role) eller en egen admin-endpoint:

```sql
INSERT INTO public.user_flags (user_id, beta_enabled)
VALUES ('<user-uuid>', true)
ON CONFLICT (user_id) DO UPDATE SET beta_enabled = true;
```

---

## Feedback

- **Tabell**: `public.feedback` (id, user_id nullable, type bug|idea|other, message max 2000, url, request_id, status new|triaged|done, created_at). RLS: användare INSERT (eget user_id eller null); SELECT egna rader; admin via service role.
- **POST /api/feedback**: Auth valfritt. Body: `{ "type": "bug"|"idea"|"other", "message": "…", "url": "…?", "request_id": "…?" }`. Returnerar `{ id, created_at }`. 400 vid ogiltig body.
- **GET /api/feedback**: Kräver auth. Returnerar `{ feedback: [...] }` med användarens egna rader.
- **GET /api/admin/feedback**: Kräver autentiserad admin-session. Returnerar `{ feedback: [...] }` med alla rader.

### Testa med curl

```bash
# Skicka feedback (auth valfritt)
curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"bug","message":"Something broke"}'
# Förväntat: 200, { "id": "...", "created_at": "..." }

# Ogiltig type → 400
curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"invalid","message":"Hi"}'
# Förväntat: 400

# Lista egna (kräver cookie)
curl -s http://localhost:3000/api/feedback -H "Cookie: <session>"
# Förväntat: 200, { "feedback": [...] }

# Admin lista: kör i en inloggad browser-session eller med session-cookie för en admin-användare
```

---

## Funnel metrics

- **GET /api/admin/metrics/funnel**: Kräver autentiserad admin-session. Läser `analytics_events` senaste 7 dagar, grupperar per event_name, delar upp author/reader utifrån path (path innehåller "author" eller "reader"). Returnerar `{ since, author: [{ event_name, count }], reader: [...] }`.

### Testa med curl

Admin-funnel testas via inloggad admin-session i browser eller med en export av adminens session-cookie.

---

## UI

- **/account/feedback**: Formulär (type, message) + lista över egna feedback med status. Länk från user menu (Feedback).
- User menu: länk "Feedback" till `/account/feedback`.

---

## Rutiner

- **Beta**: Sätt `beta_enabled` för testanvändare via Supabase eller admin; sätt `BETA_LOCK=true` i prod när du vill begränsa till beta.
- **Feedback**: Triera i Supabase (`status`: new → triaged → done) eller bygg admin-UI som uppdaterar status.
- **Funnel**: Använd funnel-endpointen för att följa author- och reader-steg över tid; säkerställ att `analytics_events` fylls (t.ex. från befintlig event-ingestion).
