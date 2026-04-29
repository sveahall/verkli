# Verkli — Beta Release Gate

## TLDR

**Automatiserad gate:** `npm run qa:beta` (env check → tests → lint → build).
20 manuella testfall i GIVEN/WHEN/THEN som kan köras i staging med två testkonton. Release gate: alla 8 P0 gröna, max 2 av 7 P1 röda (med dokumenterad workaround), P2 informational. Inkluderar 15-min pre-demo runbook.

---

## Automated QA Gate

Run from `apps/web/`:

```bash
npm run qa:beta
```

This runs 4 sequential stages — any failure aborts:

| Stage | What it does |
|-------|-------------|
| 1. Env check | Verifies billing-critical env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 2. Tests | `vitest run` — all unit tests including webhook idempotency and checkout pricing |
| 3. Lint | `eslint .` — 0 errors required |
| 4. Build | `next build` — includes TypeScript type-checking |

**Prerequisite:** Copy `.env.example` to `.env.local` and fill in real values.

---

## Release Gate — Regler

| Regel | Krav |
|---|---|
| **P0 (8 st)** | ALLA måste vara ✅ PASS. Ingen ship utan. |
| **P1 (7 st)** | Max 2 får vara ❌ FAIL, men varje FAIL kräver dokumenterad workaround som testats i staging. |
| **P2 (5 st)** | Informational. Loggas som known issues. Blockerar inte release. |
| **Testmiljö** | Staging med produktionslik data. Inte localhost. |
| **Testkonton** | Konto A: `qa-author@test.verkli.com` (Author, Pro-plan). Konto B: `qa-reader@test.verkli.com` (Reader, Free-plan). |
| **Browsers** | Chrome latest + Safari latest (eller mobil Safari om mobile-first). |
| **Tidsgräns** | Hela sviten ska gå att köra på < 90 min av en person. |

---

## Testkonto-setup (Preconditions för hela sviten)

Innan testning börjar, verifiera:

```
Konto A (Author):
  - Email: qa-author@test.verkli.com
  - Roll: Author
  - Plan: Pro (aktiv Stripe subscription i test-mode)
  - Data: Minst 2 publicerade böcker, 1 draft
  - Stripe customer ID noterat

Konto B (Reader):
  - Email: qa-reader@test.verkli.com
  - Roll: Reader
  - Plan: Free
  - Data: Minst 1 bok i biblioteket (köpt/tillagd)

Stripe:
  - Test-mode aktivt
  - Webhook endpoint pekar mot staging
  - Test-klockkort: 4242 4242 4242 4242
```

---

## 20 Testfall

---

### TC-01 — Author login happy path

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/author/signin` → `/author/home` |
| **API** | Supabase Auth (client-side) |

**Preconditions:** Konto A existerar, ej inloggad, cookies rensade.

**GIVEN** att jag är på `/author/signin`
**WHEN** jag fyller i `qa-author@test.verkli.com` + lösenord och klickar "Logga in"
**THEN**
- Redirect till `/author/home` inom 3 sekunder
- Dashboard visar korrekt författarnamn
- Inga console errors (öppna DevTools → Console)
- Ingen vit skärm eller flash of unstyled content

---

### TC-02 — Reader login happy path

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/reader/signin` → `/reader/home` |
| **API** | Supabase Auth (client-side) |

**Preconditions:** Konto B existerar, ej inloggad, cookies rensade.

**GIVEN** att jag är på `/reader/signin`
**WHEN** jag fyller i `qa-reader@test.verkli.com` + lösenord och klickar "Logga in"
**THEN**
- Redirect till `/reader/home` inom 3 sekunder
- Hemsidan laddar utan errors
- Inga console errors

---

### TC-03 — Login med fel lösenord

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/author/signin` |
| **API** | Supabase Auth (client-side) |

**Preconditions:** Konto A existerar.

**GIVEN** att jag är på `/author/signin`
**WHEN** jag fyller i korrekt email men fel lösenord och klickar "Logga in"
**THEN**
- Felmeddelande visas inom 2 sekunder (ej "500 Internal Server Error")
- Meddelandet avslöjar INTE om emailen finns ("Fel email eller lösenord")
- Jag är kvar på `/author/signin`
- Inget crash, ingen vit skärm

---

### TC-04 — Stripe checkout happy path (ny prenumeration)

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/account/billing` → Stripe Checkout → `/account/billing` |
| **API** | `POST /api/billing/checkout`, `POST /api/stripe/webhook` |

**Preconditions:** Konto B inloggad. Free-plan. Stripe test-mode aktivt.

**GIVEN** att jag är inloggad som Reader (Free) och är på `/account/billing`
**WHEN** jag klickar "Uppgradera till Pro" och i Stripe Checkout fyller i testkortet `4242 4242 4242 4242`, valfritt expiry i framtiden, valfri CVC, och slutför betalning
**THEN**
- Jag redirectas tillbaka till `/account/billing`
- Sidan visar "Pro" som aktiv plan inom 30 sekunder
- Stripe Dashboard (test-mode) visar en lyckad payment
- Om det tar > 10s: en laddningsindikator eller "Bearbetar..." visas

---

### TC-05 — Stripe checkout dubbelklick-skydd

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/account/billing` |
| **API** | `POST /api/billing/checkout` |

**Preconditions:** Konto B inloggad. Free-plan.

**GIVEN** att jag är inloggad som Reader (Free) och är på `/account/billing`
**WHEN** jag klickar "Uppgradera till Pro" snabbt TRE gånger i rad
**THEN**
- Bara EN Stripe Checkout-session öppnas (kolla i Stripe Dashboard → Checkout Sessions)
- Knappen disablas eller visar spinner efter första klick
- INTE tre parallella checkout-fönster
- INTE tre charges i Stripe

---

### TC-06 — Billing-sida med expired/felaktig Stripe-nyckel

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/account/billing` |
| **API** | `POST /api/billing/checkout` |

**Preconditions:** Konto B inloggad. Simulera detta genom att (a) testa med fel Stripe key i staging env, ELLER (b) koppla temporärt bort Stripe-env-variabel.

**GIVEN** att jag är inloggad och navigerar till `/account/billing`
**WHEN** jag klickar "Uppgradera till Pro"
**THEN**
- Ett användarvänligt felmeddelande visas (ej stack trace, ej "Stripe API error", ej vit skärm)
- Sidan kraschar INTE
- Console visar eventuellt ett error men UI hanterar det

> **Notera:** Om ni inte kan simulera detta i staging, markera som SKIP med anledning. Men detta är det vanligaste demo-failure-scenariot.

---

### TC-07 — Webhook processar korrekt efter checkout

| | |
|---|---|
| **Severity** | P0 |
| **Route** | Backend: `/api/stripe/webhook` |
| **API** | `POST /api/stripe/webhook` (Stripe → er server) |

**Preconditions:** TC-04 genomförd. Tillgång till server-loggar eller Supabase.

**GIVEN** att en lyckad checkout just genomförts (TC-04)
**WHEN** jag kollar Stripe Dashboard → Webhooks → Recent events
**THEN**
- `checkout.session.completed` event visas med status 200
- Supabase: användaren har `plan: 'pro'` (eller motsvarande) i user/subscription-tabellen
- Om webhook failade: det finns retry-logik (Stripe visar "Retrying")

---

### TC-08 — Subscription cancellation

| | |
|---|---|
| **Severity** | P0 |
| **Route** | `/account/billing` |
| **API** | `POST /api/billing/portal` (Stripe Customer Portal) |

**Preconditions:** Konto med aktiv Pro-plan (efter TC-04). Inloggad.

**GIVEN** att jag är inloggad med aktiv Pro-plan och är på `/account/billing`
**WHEN** jag klickar "Avbryt prenumeration" (eller motsvarande) och bekräftar
**THEN**
- Bekräftelsedialog visas INNAN avbrytning sker (ej direkt cancel)
- Efter bekräftelse: plan visas som "Avbryts vid periodens slut" eller liknande
- Stripe Dashboard: subscription status = "Canceling" (ej "Canceled" direkt om period kvar)
- Användaren har fortfarande tillgång under resterande period

---

### TC-09 — Author: visa boklistning

| | |
|---|---|
| **Severity** | P1 |
| **Route** | `/author/books` |
| **API** | Supabase query (client-side) |

**Preconditions:** Konto A inloggad. Har 2 publicerade + 1 draft.

**GIVEN** att jag är inloggad som Author och navigerar till `/author/books`
**WHEN** sidan laddar klart
**THEN**
- Alla 3 böcker visas (2 publicerade, 1 draft)
- Draft markeras tydligt (badge, status, annan färg)
- Boktitlar, omslag (eller placeholder) laddas utan broken images
- Laddningstid < 3 sekunder

---

### TC-10 — Reader: öppna och läs en bok

| | |
|---|---|
| **Severity** | P1 |
| **Route** | `/reader/library` → `/reader/books/:id` |
| **API** | Supabase query (server component) |

**Preconditions:** Konto B inloggad. Har minst 1 bok i biblioteket.

**GIVEN** att jag är inloggad som Reader och är på `/reader/library`
**WHEN** jag klickar på en bok i biblioteket
**THEN**
- Redirect till `/reader/books/:id` (eller modal/viewer öppnas)
- Bokens innehåll visas inom 3 sekunder
- Text är läsbar (korrekt font, storlek, kontrast)
- Inga broken layout-element

---

### TC-11 — Direkt URL-access utan login (auth guard)

| | |
|---|---|
| **Severity** | P1 |
| **Route** | `/author/home`, `/reader/library`, `/account/billing` |
| **API** | Middleware / auth guard |

**Preconditions:** Ej inloggad. Cookies rensade. Inkognito-fönster.

**GIVEN** att jag INTE är inloggad
**WHEN** jag navigerar direkt till `/author/home`
**THEN**
- Redirect till `/author/signin` (ej 403-sida, ej vit skärm, ej dashboard-data exponerad)

**Upprepa för:**
- `/reader/library` → redirect till `/reader/signin`
- `/account/billing` → redirect till `/author/signin`
- `/author/books` → redirect till `/author/signin`

---

### TC-12 — Author försöker nå Reader-routes och vice versa

| | |
|---|---|
| **Severity** | P1 |
| **Route** | Konto B → `/author/books` |
| **API** | Middleware / role guard |

**Preconditions:** Konto A (Author) inloggad.

**GIVEN** att jag är inloggad som Author
**WHEN** jag navigerar manuellt till `/reader/library`
**THEN**
- Authors kan nå reader-routes (by design — authors kan också läsa). Verifiera att sidan laddar utan crash.

**Upprepa omvänt:** Konto B (Reader) → `/author/books`
- Redirect till `/reader/home?error=author_required` (ej vit skärm, ej author-data exponerad)

---

### TC-13 — Billing-sida visar korrekt plan-status

| | |
|---|---|
| **Severity** | P1 |
| **Route** | `/account/billing` |
| **API** | `GET /api/billing/state` |

**Preconditions:** Konto A (Pro). Konto B (Free). Båda inloggade i separata browsers/inkognito.

**GIVEN** att Konto A (Pro) är inloggad och navigerar till `/account/billing`
**WHEN** sidan laddar
**THEN**
- Visar "Pro" som aktiv plan
- Visar nästa fakturadatum (eller "Aktiv prenumeration")
- Visar avbryt-knapp

**Upprepa för Konto B (Free):**
- Visar "Free" som aktiv plan
- Visar uppgradera-knapp
- Visar INTE avbryt-knapp

---

### TC-14 — Browser back efter checkout

| | |
|---|---|
| **Severity** | P1 |
| **Route** | Stripe Checkout → browser back → `/account/billing` |
| **API** | — |

**Preconditions:** Konto B inloggad. Startat checkout-flow (TC-04 steg 1–2).

**GIVEN** att jag är i Stripe Checkout (har klickat "Uppgradera")
**WHEN** jag trycker browser Back-knapp UTAN att slutföra betalning
**THEN**
- Jag hamnar tillbaka på `/account/billing`
- Plan är fortfarande "Free" (ingen halvfärdig state)
- Jag kan klicka "Uppgradera" igen utan error
- Stripe Dashboard: checkout session markerad som "Expired" eller "Incomplete" (ej "Paid")

---

### TC-15 — Expired auth token under session

| | |
|---|---|
| **Severity** | P1 |
| **Route** | Valfri autentiserad route |
| **API** | Supabase Auth refresh |

**Preconditions:** Konto A inloggad. Simulera genom att (a) vänta tills token expirerar, ELLER (b) manuellt rensa Supabase auth-token i DevTools → Application → Local Storage.

**GIVEN** att jag är inloggad men min auth-token har expirerat
**WHEN** jag navigerar till `/author/home` eller gör en action
**THEN**
- Antingen: token refreshas automatiskt och sidan fungerar normalt
- Eller: redirect till `/author/signin` med tydligt meddelande ("Din session har gått ut")
- INTE: vit skärm, 401-error i UI, eller data som laddas halvt

---

### TC-16 — Author dashboard med 0 böcker (tom state)

| | |
|---|---|
| **Severity** | P2 |
| **Route** | `/author/books` |
| **API** | Supabase query (client-side) |

**Preconditions:** Skapa nytt Author-konto utan böcker, ELLER ta temporärt bort böcker från Konto A.

**GIVEN** att jag är inloggad som Author utan böcker
**WHEN** jag navigerar till `/author/books`
**THEN**
- Empty state visas ("Du har inga böcker ännu" + CTA)
- INTE: tom sida, spinner som aldrig slutar, eller "undefined"
- INTE: felmeddelande

---

### TC-17 — Billing-sida på mobil viewport

| | |
|---|---|
| **Severity** | P2 |
| **Route** | `/account/billing` |
| **API** | — |

**Preconditions:** Konto B inloggad. Chrome DevTools → Device Toolbar → iPhone 14 (390x844).

**GIVEN** att jag ser `/account/billing` på mobil viewport
**WHEN** sidan renderas
**THEN**
- Alla element synliga utan horisontell scroll
- "Uppgradera"-knapp är klickbar (ej dold bakom annat element)
- Pricing-info läsbar
- Stripe Checkout fungerar från mobil viewport

---

### TC-18 — Snabb navigation mellan routes

| | |
|---|---|
| **Severity** | P2 |
| **Route** | `/author/home` → `/author/books` → `/account/billing` → back → back |
| **API** | Multiple |

**Preconditions:** Konto A inloggad.

**GIVEN** att jag är inloggad som Author
**WHEN** jag snabbt navigerar: Home → Books → Billing → Back → Back (inom 5 sekunder)
**THEN**
- Varje sida renderas korrekt (ej stale data, ej crash)
- Back-navigation hamnar på rätt sida
- Inga memory leaks (DevTools → Performance → Heap snapshot bör inte växa kraftigt)
- Inga "Can't perform state update on unmounted component"-varningar i console

---

### TC-19 — API-route utan auth header

| | |
|---|---|
| **Severity** | P2 |
| **Route** | Backend API |
| **API** | `GET /api/books`, `POST /api/billing/checkout` |

**Preconditions:** Curl eller Postman. Ingen auth header.

**GIVEN** att jag gör ett API-anrop utan Authorization header
**WHEN** jag kör:
```
curl -X GET https://staging.verkli.com/api/books
curl -X POST https://staging.verkli.com/api/billing/checkout
```
**THEN**
- Response: 401 Unauthorized (ej 500, ej 200 med data)
- Body: JSON med error message (ej stack trace, ej HTML-felsida)
- Ingen bokdata eller user-data exponeras

---

### TC-20 — Concurrent billing actions (två flikar)

| | |
|---|---|
| **Severity** | P2 |
| **Route** | `/account/billing` i två flikar |
| **API** | `POST /api/billing/checkout` |

**Preconditions:** Konto B inloggad i två flikar med `/account/billing`.

**GIVEN** att jag har `/account/billing` öppen i Tab 1 och Tab 2
**WHEN** jag klickar "Uppgradera" i Tab 1, och medan Stripe Checkout är öppen, klickar "Uppgradera" i Tab 2
**THEN**
- Bara EN aktiv checkout-session i Stripe (eller den andra ger tydligt felmeddelande)
- INTE: två parallella subscriptions skapas
- Efter att en checkout slutförts: den andra fliken visar uppdaterad plan vid refresh

---

## Release Gate — Scorecard

Fyll i under testning:

```
TC-01  P0  AUTH    Login author          [ ] PASS  [ ] FAIL  [ ] SKIP
TC-02  P0  AUTH    Login reader          [ ] PASS  [ ] FAIL  [ ] SKIP
TC-03  P0  AUTH    Login fel lösenord    [ ] PASS  [ ] FAIL  [ ] SKIP
TC-04  P0  BILL    Checkout happy path   [ ] PASS  [ ] FAIL  [ ] SKIP
TC-05  P0  BILL    Dubbelklick-skydd     [ ] PASS  [ ] FAIL  [ ] SKIP
TC-06  P0  BILL    Stripe-nyckel fail    [ ] PASS  [ ] FAIL  [ ] SKIP
TC-07  P0  BILL    Webhook processar     [ ] PASS  [ ] FAIL  [ ] SKIP
TC-08  P0  BILL    Cancel subscription   [ ] PASS  [ ] FAIL  [ ] SKIP
TC-09  P1  CORE    Author boklistning    [ ] PASS  [ ] FAIL  [ ] SKIP
TC-10  P1  CORE    Reader läs bok        [ ] PASS  [ ] FAIL  [ ] SKIP
TC-11  P1  AUTH    Auth guard direkt-URL [ ] PASS  [ ] FAIL  [ ] SKIP
TC-12  P1  AUTH    Roll-guard cross      [ ] PASS  [ ] FAIL  [ ] SKIP
TC-13  P1  BILL    Plan-status korrekt   [ ] PASS  [ ] FAIL  [ ] SKIP
TC-14  P1  BILL    Browser back checkout [ ] PASS  [ ] FAIL  [ ] SKIP
TC-15  P1  AUTH    Expired token         [ ] PASS  [ ] FAIL  [ ] SKIP
TC-16  P2  UX      Tom author dashboard  [ ] PASS  [ ] FAIL  [ ] SKIP
TC-17  P2  UX      Billing mobil         [ ] PASS  [ ] FAIL  [ ] SKIP
TC-18  P2  UX      Snabb navigation      [ ] PASS  [ ] FAIL  [ ] SKIP
TC-19  P2  SEC     API utan auth         [ ] PASS  [ ] FAIL  [ ] SKIP
TC-20  P2  BILL    Concurrent billing    [ ] PASS  [ ] FAIL  [ ] SKIP
```

### Gate-beslut

```
P0 resultat: ___/8 PASS
  → Krav: 8/8 PASS

P1 resultat: ___/7 PASS, ___/7 FAIL
  → Krav: Max 2 FAIL, varje med dokumenterad workaround

P2 resultat: ___/5 (informational)

BESLUT:  [ ] GO   [ ] NO-GO

Signerat: ________________  Datum: ________________
```

### Workaround-dokumentation (vid P1 FAIL)

```
TC-__: [Testfallsnamn]
Failure: [Vad som hände]
Workaround: [Exakt steg för att undvika problemet i demo/beta]
Risk: [Vad händer om en beta-user triggar detta]
Fix ETA: [Timmar/dagar]
```

---

## 15-Minuters Pre-Demo Runbook

Utför detta EXAKT 15 minuter innan demo. Varje steg har en fallback.

```
TIMER: 15:00
═══════════════════════════════════════════════════

[MIN 0-2] MILJÖ-CHECK
─────────────────────
□ Öppna staging i Chrome Incognito
□ Öppna DevTools → Console (håll öppen hela demon)
□ Verifiera: inga röda errors i console vid sidladdning
□ FALLBACK: Om errors → byt till backup-URL / localhost

[MIN 2-4] AUTH-CHECK
────────────────────
□ Logga in som Konto A (Author) → verifiera /author/home laddar
□ Logga ut
□ Logga in som Konto B (Reader) → verifiera /reader/home laddar
□ FALLBACK: Om login failar → rensa cookies, prova igen.
  Om fortfarande fail → STOP. Felsök auth innan demo.

[MIN 4-7] BILLING-CHECK
────────────────────────
□ Som Konto B: navigera till /account/billing
□ Verifiera att "Uppgradera"-knapp syns
□ Klicka INTE på den (spar till demo), men verifiera att
  sidan inte kraschar
□ Öppna Stripe Dashboard i separat flik:
  - Verifiera test-mode är ON (orange banner)
  - Verifiera webhook-endpoint status: senaste event < 24h old
□ FALLBACK: Om Stripe webhook röd → gå till Stripe →
  Webhooks → Resend senaste event. Vänta 10s. Refresha.

[MIN 7-9] CONTENT-CHECK
────────────────────────
□ Som Konto A: navigera till /author/books
□ Verifiera: böcker visas med titlar och omslag
□ Verifiera: inga broken image-ikoner
□ Som Konto B: öppna en bok → verifiera att text renderas
□ FALLBACK: Om broken images → notera vilka, undvik att
  visa de böckerna under demo.

[MIN 9-11] HAPPY PATH DRY RUN
──────────────────────────────
□ Öppna TVÅ Incognito-fönster sida vid sida
□ Fönster 1: Konto A (Author)
□ Fönster 2: Konto B (Reader)
□ Navigera genom demo-flowen exakt som planerat:
  1. Visa Author /author/home
  2. Visa Reader /reader/home
  3. Visa /account/billing
□ Verifiera: alla transitions fungerar, inga laddnings-
  problem, inga konstiga states
□ FALLBACK: Om något hänger → refresha. Om det löser
  sig → notera men fortsätt. Om det inte löser sig →
  skippa den routen i demo.

[MIN 11-13] RENSA NOTIFIKATIONER & STATE
─────────────────────────────────────────
□ Rensa alla synliga notifikationer/badges
□ Verifiera att notification badge visar 0 (eller döljs)
□ Rensa browser-historik i incognito (ny session)
□ FALLBACK: Om badge stuck → ignorera, nämn inte notiser
  i demo.

[MIN 13-14] DEMO-KONTO SLUTVERIFIERING
───────────────────────────────────────
□ Logga in Konto A i demo-browser → stå på /author/home
□ Logga in Konto B i sekundär browser/flik → stå på /reader/home
□ Ha Stripe Dashboard redo i tredje flik (om billing visas)
□ FALLBACK: —

[MIN 14-15] GO/NO-GO
─────────────────────
□ Auth funkar?                    [ ] JA  [ ] NEJ
□ Author home/reader home laddar?  [ ] JA  [ ] NEJ
□ /account/billing renderas?      [ ] JA  [ ] NEJ
□ Stripe test-mode aktiv?         [ ] JA  [ ] NEJ
□ Inga console errors?            [ ] JA  [ ] NEJ

→ Alla JA?  DEMO GO.
→ Någon NEJ? Felsök eller SKIPPA den routen.
  Om Auth NEJ → DEMO NO-GO. Boka om.

═══════════════════════════════════════════════════
```

### Demo-routes att UNDVIKA (om ej testade)

| Route | Anledning |
|---|---|
| Community / feed | Kan ha empty state eller crash |
| DM | WebSocket kan vara instabil |
| Offline reading | Svårt att demo pålitligt |
| Marketing portal | Kan visa felaktig/annan users data |
| Inställningar / profil-edit | Kan ha oväntade side effects |

### Om något går fel UNDER demon

| Symptom | Action |
|---|---|
| Vit skärm | "Låt mig refresha" → F5. Fortsätt. |
| Spinner som aldrig slutar | "Systemet bearbetar, låt mig visa nästa feature" → navigera bort. |
| Fel data / konstiga siffror | "Det här är vår staging-miljö med testdata" → gå vidare. |
| Stripe-error | "Vi kör i testläge, låt mig visa er en genomförd transaktion istället" → visa Stripe Dashboard. |
| 500-error synlig i UI | "Tack, det fångade vi" → le → gå vidare. |

---

*Dokument: Verkli Beta Release Gate v1.1*
*Skapat: 2026-02-09*
*Uppdaterat: 2026-02-10 — Route-korrektion, Automated QA Gate*
*Status: Redo för exekvering*