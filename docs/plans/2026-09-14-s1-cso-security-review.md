# S1 — CSO-granskning: säkerhet, åtkomst och dataförlust

Överlämning till integrationsägaren (Codex), 14 september 2026.
Uppdrag [S1](2026-09-14-launch-task-pack.md) enligt [lanseringsplanen](2026-09-14-launch-command-plan.md).

## Överlämningsmall

| Fält | Innehåll |
|---|---|
| **ID / ägare / status** | S1 / CSO, seniorgranskare (Claude) / REVIEW klar — **BLOCKERAT** |
| **Bas-SHA → kandidat-SHA / worktree** | `codex/launch-qa-20260910` @ `e49d3c40` + 85 ocommittade filer i rootcheckouten. Ingen kandidat existerar; R0 är inte körd. Live (`origin/platform`) står på `26d02239`. |
| **Användarbeteende före → efter** | Ingen ändring. Detta är en granskning, inte ett fixpaket. |
| **Ändrade filer och filvis diff** | **Inga.** Ingen fil i repot har ändrats. Enda skrivningen är detta dokument. |
| **Verifieringskommandon, utfall och tidsstämpel** | Statisk läsning + `grep` över `apps/web/src`, `apps/web/scripts` och samtliga 111 filer i `apps/web/supabase/migrations`. Tre read-only SQL-frågor mot produktionsdatabasen via Supabase SQL Editor, körda av Svea 2026-09-14 17:42–17:47 CEST. Inga tester, byggen eller lintkörningar — de tillför inget till denna granskning. |
| **Miljö + tillåtna testbok-/jobb-ID:n** | Ingen testmiljö använd. Inga konton, böcker eller jobb rörda. |
| **UI-bevis / provider-bevis / sparat resultat / live-bevis** | Live-bevis: `pg_policy` för `public.profiles` och `storage.objects`, `storage.buckets`, `information_schema.column_privileges`. Inga UI-, provider- eller sparningsbevis — ingen sådan kontroll ingick. |
| **Faktiska externa anrop och kostnad** | **Noll.** Inga provideranrop, inga installationer, inga deployer, inga kontoskrivningar. 0 SEK av veckobudgeten förbrukad. |
| **Ej kört / skippat / blockerare** | Se [Ej kört](#ej-kört). Åtta blockerare, se nedan. |
| **Oberoende granskare och kvarvarande fynd** | Fem parallella granskaruppdrag (isolering, lagring, betalvägg, AI-missbruk, dataförlust). Varje P0 omverifierad av huvudgranskaren mot källkoden före rapportering. |
| **Kompatibilitet och rollback** | Ej tillämpligt — inga ändringar. Fixförslagen nedan är additiva eller borttagande av oanvända rättigheter; ingen av dem kräver schemamigrering av data. |
| **Nästa ägare / beroende** | Blockerare 0 och 3: DB-ägare. 1: QA/release. 2: B1. 4, 5, 7: B2. 6: E1 (äger filen). |

## Sammanfattning

Åtta blockerare. Tre bekräftade direkt mot produktionsdatabasen, fem bevisade i källkod.

| # | Blockerare | Bevisläge | Grind | Åtgärdens storlek |
|---|---|---|---|---|
| **0** | Vilken inloggad användare som helst kan göra sig till författare | **LIVE ✓** | G1 | 1 rad SQL |
| 1 | `qa:beta` kan inte faila på öppen betalvägg | kod ✓ | G6 | 1 rad × 3 filer |
| 2 | Godtycklig storage-signering via ovaliderad bucket | kod ✓ | G1, G5 | 4 rader |
| **3** | Alla inloggade kan läsa hela ljudboks-bucketen | **LIVE ✓** | G1, G4 | droppa 2 policyer |
| 4 | Misslyckad återimport raderar utkastet | kod ✓ | G2 | flytta en delete |
| 5 | Översättning raderar godkänt resultat före första anropet | kod ✓ | G3 | ny version + växla |
| 6 | Misslyckad autosave återförsöks aldrig | kod ✓ | G2 | timer + beforeunload |
| 7 | Avbryt fungerar inte på ljudboksjobb | kod ✓ | G2, budget | egna kolumner |

**Börja med nummer 1.** Inte för att den är farligast, utan för att de övriga sju inte går att bevisa åtgärdade så länge grinden rapporterar godkänt oavsett utfall.

**Kedjan som gör 0 och 2 till ett enda hål:** registrera konto → sätt `role: "author"` → INSERT i `audiobook_assets` → signerad URL till vilken fil som helst i vilken bucket som helst. Från anonym besökare till godtycklig filläsning i tre steg, inget av dem privilegierat.

---

## BLOCK-S1-00 — Vilken inloggad användare som helst kan göra sig till författare

**KRITISK · Konfidens 9/10 · BEKRÄFTAD MOT PRODUKTION**

Tre lager som alla ska begränsa, inget som begränsar kolumner.

**RLS live** (`pg_policy` mot `public.profiles`, 5 policyer):

```
Users can update own profile | w | (auth.uid() = user_id)
```

Både `USING` och `WITH CHECK` är `auth.uid() = user_id`. Båda pinnar `user_id`. Ingendera begränsar vilka kolumner som får ändras — den nya raden tillhör fortfarande dig efter att `role` ändrats.

**Kolumnrättigheter live** (`information_schema.column_privileges`, grantee `authenticated`):

```
role       | UPDATE
demo_mode  | UPDATE
```

**Grinden litar på exakt den kolumnen** — `apps/web/src/lib/auth/require-author.ts:35-41`:

```ts
// SECURITY: Only trust profiles.role from DB — user_metadata is client-writable.
const { data: profile } = await supabase
  .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
```

Kommentaren beskriver härdningen som skapade problemet: förtroendet flyttades från `user_metadata`, som är klientskrivbar, till `profiles.role` — som också är klientskrivbar, bara via en annan väg.

**Reproduktion:** registrera ett konto → `PATCH /rest/v1/profiles?user_id=eq.<eget uid>` med `{"role":"author"}` och den publika anon-nyckeln → samtliga författarroutes öppnas, inklusive varje betald generering.

**Konsekvens:** bryter G1 i grunden. Öppnar dessutom `demo_mode`, vilket enligt `cover/generate:106-125` tar bort rate limitern på fal.ai-bildgenerering — en kostnadsbypass utöver behörighetsbypassen.

### Fixen bryter ingenting — kontrollerat

Varje skrivning till `role` och `demo_mode` i kodbasen:

| Plats | Klient eller server | Skriver `role`? |
|---|---|---|
| `api/admin/users/route.ts:170` | server, admin-API | ja |
| `api/admin/author-applications/route.ts:124` | server, admin-API | ja |
| `api/dev/toggle-demo-mode/route.ts:65` | server | `demo_mode` |
| `features/auth/roles.ts:52` | **server** | **nej** — skriver bara `preferences` |
| `components/PublicRoleCta.tsx:37` | klient | **nej** — läser bara |

Ingen klientkod skriver någondera kolumnen. Rättigheten har aldrig använts.

**Minsta åtgärd:**

```sql
REVOKE UPDATE (role, demo_mode) ON public.profiles FROM authenticated;
```

En rad. Rör inte RLS, bryter inget flöde.

**Invarianten fanns redan nedskriven** — `features/auth/roles.ts:49-50`:

```ts
// SECURITY: Only update preferences.active_role.
// profiles.role is immutable original signup role and must never be written here.
```

Applikationen behandlar fältet som oföränderligt. Databasen gör det inte. Ingen kontroll jämförde de två.

---

## BLOCK-S1-01 — `qa:beta` kan inte faila på en öppen betalvägg

**KRITISK (process) · Konfidens 10/10 · kodverifierad, ingen DB-verifiering behövs**

`apps/web/scripts/check-rls-paywall.ts:186-195`:

```ts
if (!strict) console.log(`Reporting only — pass --strict to fail on these.\n`);
process.exit(strict ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖  check crashed: ${...}\n`);
  process.exit(strict ? 1 : 0);
});
```

`apps/web/scripts/qa-beta.mjs:236` anropar scriptet utan flaggan. `run()` (`:199-208`) tolkar exit 0 som godkänt och skriver `✔ RLS paywall check passed.`

När scriptet upptäcker en öppen betalvägg skriver det ut
`❌ anon read a chapter of the published PAID book "…". The paywall is open right now.`
och avslutar med **0**. Grinden fortsätter till `✔ Beta Release Gate — ALL PASSED`.

**Samma mönster i tre steg:** `check-billing-catalog` (`qa-beta.mjs:224`), `check-stripe-webhook` (`:227`), `check-rls-paywall` (`:236`).

**Rotorsak:** en flagga styr tre olika utfall. Kommentaren på `:220-223` motiverar icke-strikt läge korrekt *för skip-fallet* — utan credentials ska en lokal körning inte faila. Men `strict` styr också `problems.length > 0` och `catch`. Avsikten var "hoppa över utan nycklar"; effekten blev "rapportera aldrig fel".

**Kommentaren säger att lanseringsgrinden är platsen för `--strict`. Den grinden finns inte.**
`grep -rn -- "--strict" scripts/ package.json .github/` ger enbart docstrings och manuella kommandotips. `qa:beta` och `qa:beta:ci` är båda `node scripts/qa-beta.mjs`. Ingen automatiserad väg i repot skickar någonsin flaggan.

**Konsekvens:** G6 kräver "Inga kritiska tester är överhoppade". Tre kritiska kontroller är inte överhoppade utan något värre — de körs, upptäcker fel och rapporterar godkänt. Varje tidigare grönt `qa:beta` är svagare bevis än det såg ut.

**Minsta åtgärd**, i alla tre scripten:

```ts
if (problems.length > 0) { /* skriv ut */ process.exit(1); }   // alltid
```

Låt `skip()` fortsätta respektera `--strict`. Det är den uppdelning kommentarerna redan beskriver som avsedd.

---

## BLOCK-S1-02 — Godtycklig storage-signering via ovaliderad bucket

**KRITISK · Konfidens 9/10 · kodverifierad**

Två oberoende vektorer. Båda slutar i att service-role-klienten signerar en bucket och sökväg som anroparen kontrollerar.

### Vektor A — `ai_jobs.output`

`apps/web/src/app/api/author/jobs/route.ts:246-268`:

```ts
const audioBucket =
  typeof output.audioBucket === "string" && output.audioBucket.trim().length > 0
    ? output.audioBucket.trim()      // rå JSONB från ai_jobs.output
    : defaultBucket;
```

RLS tillåter skrivningen — `supabase/migrations/20260207090000_worker_contract_and_storage.sql:88-92` ger `ai_jobs_update_own` UPDATE utan kolumnlista. Round 2 (`20260327110000:37`) tog bort endast `ai_jobs_insert_own`.

### Vektor B — `audiobook_assets`, kräver bara en INSERT

`supabase/migrations/20250203000000_books_audiobook_pipeline.sql:46-54` grindar INSERT enbart på bokägarskap. Inget villkor rör `audio_bucket`.

`apps/web/src/app/api/author/jobs/route.ts:218`:

```ts
const bucket = asset.audioBucket?.trim() || defaultBucket;
```

### Signeringen

`route.ts:52-54`, service role, ingen allowlist:

```ts
const { data, error } = await admin.storage
  .from(bucket)
  .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
```

Sökvägen saneras inte — `route.ts:31-37` avvisar bara absoluta `http(s)`-URL:er:

```ts
if (/^https?:\/\//i.test(trimmed)) return null;
return trimmed;                        // ingen prefixkontroll, inget ".."-skydd
```

`audio_bucket` har **noll DB-validering**: kolumnen nämns på två rader i samtliga 111 migrationer (`20260222100000:5,11`), båda definition och backfill. Den enda CHECK på tabellen gäller `audio_path` och avvisar `http://` — samma sak som `normalizePreviewPath` redan gör. Två kontroller av samma halva av nyckeln, ingen av bucketen.

**Målet är hårdkodat och icke-hemligt** — `apps/web/src/lib/orders/ta-for-er.ts:66-83`:

```ts
path: "ta-for-er/ta-for-er.pdf",
export const TA_FOR_ER_DOWNLOAD_BUCKET = "book-downloads";
/** Private bucket. Never make this public — the file is the product. */
```

**Reproduktion (vektor B):** författarkonto →
`POST /rest/v1/audiobook_assets` med
`{"book_id":"<egen bok>","audio_path":"ta-for-er/ta-for-er.pdf","audio_bucket":"book-downloads","status":"generated"}` →
`GET /api/author/jobs` → svaret innehåller en service-role-signerad URL till 75 kr-boken, TTL 15 min (`route.ts:29`). Byt bucket och path för `book-imports/<annan uid>/…` (råa manus) eller `tts_previews/<annan uid>/…`.

**Konsekvens:** bryter G1 och G5. Hela Stripe-grinden kringgås — inget köp, ingen order, inget entitlement. Utfärdade URL:er kan inte återkallas.

**Rätt mönster finns redan i kodbasen:**

| Fil | Rad | Kod |
|---|---|---|
| `audiobook/status/route.ts` | `:178` | `const assetBucket = defaultBucket;` ✅ |
| `author/jobs/route.ts` | `:218` | `const bucket = asset.audioBucket?.trim() \|\| defaultBucket;` ❌ |

Status-routen är dock bara halvfixad — den trustar fortfarande `output.audioBucket` på `:188-204`.

**Minsta åtgärd:** använd `getAudiobookStorageBucket()` ovillkorligt på fyra ställen — `author/jobs/route.ts:218` och `:246-261`, `audiobook/status/route.ts:188-204`, `books/[id]/jobs/route.ts:645-661`. Droppa dessutom `ai_jobs_update_own`; workers kör service role och ingen klientkod skriver `output`.

---

## BLOCK-S1-03 — Alla inloggade kan läsa hela ljudboks-bucketen

**KRITISK · Konfidens 9/10 · BEKRÄFTAD MOT PRODUKTION**

`pg_policy` mot `storage.objects` live:

```
storage_audio_outputs_select_authenticated | r |
  ((bucket_id = ANY (ARRAY['audiobooks'::text, 'tts-outputs'::text])) AND (auth.role() = 'authenticated'))

storage_content_assets_select_authenticated | r |
  ((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'))
```

Källa: `supabase/migrations/20260327100000_security_hardening_beta.sql:25-31` och `20260327110000:96-101`. Härdningen bytte `anon` mot `authenticated` och stannade där — inget bok-, pris-, entitlement- eller ägarvillkor.

Båda bucketarna är privata (`storage.buckets.public = false`), så **dessa policyer är grinden**. `auth.role() = 'authenticated'` uppfylls av vilket gratiskonto som helst.

Ljudboksworkern skriver kapitelljud till exakt denna bucket (`scripts/audiobook-worker.ts:48`, upload `:795`).

**Reproduktion:** registrera ett läsarkonto →
`POST {SUPABASE_URL}/storage/v1/object/list/audiobooks` med `apikey: <anon>` och `Authorization: Bearer <JWT>` → alla objektnycklar →
`GET /storage/v1/object/audiobooks/<nyckel>` med samma headers.

**Konsekvens:** entitlement-kontrollen i `api/books/[id]/audiobook/play/route.ts:113-128` grindar en route ingen behöver anropa. Betalda ljudböcker är gratis för varje konto. Bryter G4.

**Minsta åtgärd:** droppa båda policyerna. Alla legitima läsvägar går via service-role-signering, som bypassar RLS ändå. Om en policy måste finnas ska den joina mot `entitlements`, inte testa `auth.role()`.

---

## BLOCK-S1-04 — Misslyckad återimport raderar utkastet

**KRITISK · Konfidens 9/10 · kodverifierad**

`apps/web/scripts/import-worker.ts:400-403`:

```ts
const { error: deleteError } = await supabase
  .from("chapters")
  .delete()
  .eq("book_version_id", targetVersion.id);
```

Nya kapitel skrivs därefter i batchar om 50 (`:583-593`). Vid fel raderar `catch`-blocket (`:609-613`) allt i versionen igen.

Ingen transaktion, ingen stagingversion, ingen ögonblicksbild — `grep "rpc(\|transaction\|staging\|snapshot" scripts/import-worker.ts` ger noll träffar.

**Sekvens:** författaren importerar om en DOCX över ett befintligt utkast → extraktionen lyckas (validerad `:299`) → `:400` raderar utkastet → batch 3 av 12 failar → rollback raderar resten → utkastet är borta. Enda spåret är `book_imports.status = "failed"`. Utan `catch`, om workern dödas mellan `:403` och första batchen, körs ingen rollback alls och utkastet är bara borta.

**Konsekvens:** bryter G2 och betalöftet "importera ett manus … utan tyst textförlust".

**Minsta åtgärd:** insert använder redan `upsert(batch, { onConflict: "book_version_id,order" })` (`:585-587`), så överskrivningen hanteras av upserten. Raderingen på `:400` behövs bara för kapitel *bortom* det nya antalet. Flytta den till efter sista lyckade batchen och begränsa till `order >= rows.length`. Det tar bort hela fönstret där utkastet inte finns någonstans.

---

## BLOCK-S1-05 — Översättning raderar godkänt resultat före första modellanropet

**KRITISK · Konfidens 9/10 · kodverifierad**

`apps/web/scripts/translation-worker.ts:426`:

```ts
await supabase.from("chapters").delete().eq("book_version_id", resolvedTargetVersionId);
```

Första provideranropet sker på `:557`, drygt 130 rader senare.

**Sekvens:** författaren kör om en översättning med overwrite på en 40-kapitelsbok → alla 40 målkapitel raderas → översättningen börjar → providerfel, budgettak eller workerkrasch halvvägs → den tidigare godkända översättningen finns inte längre och den nya är ofullständig.

**Detta motsäger G3 ordagrant:** *"original/äldre godkänt resultat bevaras vid fel"*. Koden raderar det godkända resultatet innan den vet om ersättningen går att producera.

**Minsta åtgärd:** skriv till en ny målversion och växla först när alla kapitel är klara, eller radera per kapitel direkt före respektive upsert. Enkapitelsvarianten (`:411-425`) gör redan det rätta — den raderar bara det `order` den ska ersätta.

---

## BLOCK-S1-06 — Misslyckad autosave återförsöks aldrig

**HÖG · Konfidens 8/10 · kodverifierad, runtime-prov återstår**

`apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud.ts:154-161`:

```ts
if (transientFailures.length > 0) {
  setSaveError(true);
  setHasUnsavedChanges(true);
  toast.error("Could not save. Your changes are still here — keep this tab open and try again.");
  return;
}
```

Kön `pendingSavesRef` (`:81`) dräneras enbart inifrån `handleAutoSave` (`:120`). Ingen timer, inget `online`- eller `visibilitychange`-hook. `grep -rn "beforeunload" src/` ger noll träffar.

**Sekvens:** författaren skriver → nätverksglapp → toasten säger att texten är säker → författaren **slutar skriva, just för att de såg ett fel** → ingen ny commit → ingen ny dränering, aldrig → reload, stängd flik eller klick på "Library"-breadcrumben (`BookEditorView.tsx:536`) slänger kön tyst.

Meddelandet är sant bara så länge författaren fortsätter skriva — motsatsen till vad en person gör när de ser ett sparfel. Även utan fel kostar en hård reload upp till ~2 s skrivande (`components/editor/autosaveScheduler.ts:29`, `AUTOSAVE_MAX_WAIT_MS = 2000`) utan varning.

**Minsta åtgärd:** dränera om på backoff-timer så länge `pendingSavesRef.current.size > 0`, plus en `beforeunload` grindad på osparat tillstånd.

**Filägarskap:** E1 äger denna fil enligt uppdragspaketet. Ändringen ska beställas genom den ägaren.

---

## BLOCK-S1-07 — Avbryt fungerar inte på ljudboksjobb

**HÖG · Konfidens 9/10 · kodverifierad · direkt budgetrisk**

`cancelRequested: false` skrivs ovillkorligt på nio ställen i `apps/web/scripts/audiobook-worker.ts` (`:354, 433, 448, 516, 714, 743, 843, 909, 944`). Flaggan **läses** på ett enda ställe, `readControlFlags()` (`:330`), anropad från `waitWhilePausedOrCancelled()` (`:347`).

Två förlustvägar:

1. **Deterministisk.** Jobbets startuppdatering `:501-518` skriver `cancelRequested: false` innan första kapitlet. Ett avbryt som klickas medan jobbet ligger i kön raderas garanterat.
2. **TOCTOU per kapitel.** Loopen anropar checkpointen överst i varje varv (`:580-581`). Inuti: läs flaggor `:347` → hantera cancel `:348` → om inte pausad, skriv `cancelRequested: false` `:354-355`. Ett avbryt mellan läsning och skrivning raderas.

Samma kodrader (`:323`, `:327`) kastar bort update-felet, så ett misslyckat avslutande `updateJob("completed")` lämnar `ai_jobs.status = "processing"` och `books.audiobook_status = "generating"` permanent över en ljudbok som faktiskt finns.

**Konsekvens:** författaren klickar Avbryt, UI:t bekräftar, jobbet fortsätter generera. ElevenLabs-saldot står enligt er egen inventering på 1836 av 5000 och veckans ljudbudget är 1400 SEK — ett ostoppbart jobb är en konkret budgetrisk.

**Minsta åtgärd:** flytta `pauseRequested` och `cancelRequested` till egna kolumner som workern aldrig skriver. Alternativt pinna varje merge med `.eq("updated_at", <läst värde>)`. Ta aldrig bort en flagga som en annan process äger.

---

## Medelallvarliga fynd

| # | Fynd | Fil | Bevisläge |
|---|---|---|---|
| M1 | `chapter-media` är `public: true` med policyn `(bucket_id = 'chapter-media')` och ingen rollkontroll. Vem som helst utan konto kan läsa och lista den | live `pg_policy` + `storage.buckets` | **LIVE ✓** — innehållet okänt, se Ej kört |
| M2 | Anon kan lista `book_covers` och `marketing-media`. Nycklar är `{userId}/{bookId}/…` → läcker författar-uid och bok-id för **utkast** | `20260207090000:283-286`, `20260226170000:19-22` | LIVE ✓ |
| M3 | Skrivpolicyer inventeras aldrig av grinden (`check-rls-paywall.ts:110` filtrerar `cmd === "SELECT"`), och `policy_inventory` returnerar inte `with_check` — INSERT/UPDATE-policyer kan inte utvärderas | `20260910150000:20-42` | kod ✓ |
| M4 | Oautentiserad `GET /api/books/[id]/genres` läser utkastböckers genrer. Syskon-`PUT` kontrollerar ägarskap korrekt | `api/books/[id]/genres/route.ts:6-25` | granskarrapporterat |
| M5 | `book_genres`-policyer har okvalificerad `book_id` i subquery — samma klass som den kända `can_view_book`-shadowingbuggen. Latent: bryts om `books` någonsin får en `book_id`-kolumn | `20260219130000:185-194` | granskarrapporterat |
| M6 | Betald e-bok signeras med 3600 s TTL och `download: true`. Kan inte återkallas | `api/order/ta-for-er/download/route.ts:48` | kod ✓ |
| M7 | `AVATARS_BUCKET_PUBLIC` defaultar till public och bakas in vid build. Att göra bucketen privat är verkningslöst utan `.env.local` + `rm -rf .next` | `lib/supabase/config.ts:1-2`, `avatar.ts:34-41` | kod ✓ |
| M8 | Kapitelomordning saknar all felhantering över `2N` skrivningar. Avbrott mellan sentinelfas och återställning lämnar negativa `order`; boken ser rätt ut tills reload | `useChapterCrud.ts:410-422` | granskarrapporterat |
| M9 | Kapitelrubrik sparas utan `.select("id")` och utan toast vid fel. Noll uppdaterade rader rapporteras som lyckat — exakt det `persistChapterContent` (`:43-59`) redan härdats mot | `useChapterCrud.ts:288-293` | granskarrapporterat |
| M10 | `POST /api/books/import` skapar ny `book_imports`-rad per anrop utan dedupe-nyckel. Dubbelklick ger två jobb; det andra anpassar sig till `sv-import-<id>-1` istället för att avbryta → andra hel kopia av boken | `import/route.ts:128-141`, `import-queue.ts:76` | granskarrapporterat |

### Kostnadsfynd

| # | Fynd | Fil | Not |
|---|---|---|---|
| C1 | Två betalda Higgsfield-routes helt utan rate limit, utan PRO-gate, utan budget (~0,15 USD/render) | `author/marketing/posts/[id]/generate-trailer/route.ts`, `marketing/video/generate/route.ts` | Mitigerat: `isMarketingEnabled()` defaultar false. **Kontrollera prod-env innan flaggan slås på.** Kontrollen finns redan i `books/[id]/trailer/build/route.ts:35` med `maxPerMinute 1` och `requireProBillingForApi` |
| C2 | `ai/text-to-video` implementerar egen token bucket över en modullokal `Map` istället för den delade limitern — per process, delas inte mellan Railway-repliker | `api/ai/text-to-video/route.ts:21-42` | Samma betalda leverantör |
| C3 | Översättning staplar `attempts: 3` × `MAX_CHUNK_RETRY = 3` × `maxRetries: 2` = upp till 27 debiterade Anthropic-anrop per batch mot **en** reservation. Ett omförsök startar dessutom om från kapitel 0 | `translation-queue.ts:30`, `translation-worker.ts:49,131,430-445`, `anthropic-translator.ts:73` | Rätt mönster finns i `audiobook-worker.ts:600-612` — `chapter_audio_cache` på innehållshash gör omförsök gratis |
| C4 | `withTimeout` är `Promise.race`; vid 150 s avbryts den lokala väntan men inte den debiterade renderingen, och `requestId` sparas inte på den vägen → betald output oåterkallelig | `lib/higgsfield.ts:42-54`, `marketing/video/generate/route.ts:166-188` | Ingen automatisk omdebitering; respend kräver att författaren trycker igen |

### Promptinjektion

| # | Fynd | Fil | Not |
|---|---|---|---|
| P1 | `profile.preserve[]` är en oförankrad fritextkanal in i båda granskarprompterna. `pipeline.ts:52-58` validerar endast `glossary.source` mot manuset. Profilen genereras av modellen från manuset och återinjiceras i varje granskaranrop för hela boken | `translation-quality/pipeline.ts:52-58` | **Finns endast i worktree `translation-quality-20260914`** — kan inte blockera lanseringen. Fix är en rad som speglar den befintliga glossary-regeln |
| P2 | Boktiteln konkateneras in i systemprompten. `sanitize()` strippar kontrolltecken och Llama-rollmarkörer men inte citattecken, så en titel kan stänga citatet. Titeln är angriparnåbar via EPUB-metadata (`import-worker.ts:502`, `normalizeTitleValue` saknar längdtak) | `lib/ai/writing-assistant.ts:84-88` | På granskad gren. Låg allvarlighet: självinjektion, utdata går tillbaka till samma författare, 160 teckens tak. Fix: skicka titeln via `buildUserPrompt` med befintligt avgränsarblock (`:131`) |

---

## Rensat med bevis

Lika viktigt som blockerarna:

- **Ingen cross-tenant IDOR** i någon av de 160 API-routarna. Ägarskap kontrolleras genomgående via `getBookAsOwner`, `assertBookOwned` eller explicit `.eq("author_id", user.id)`. Delade guard-helpers lästa rad för rad efter shadowing, early-return och valfri-`||` — inga hittade. `getBookAsOwner` failar stängt när selecten utelämnar `author_id`.
- **Alla dynamiska routes awaitar `params`** korrekt (Next 16-fällan).
- **Path traversal är inte nåbar.** Alla storage-nycklar byggs serverside från `userId`/`bookId`/`importId`/`chapterId`. Enda stället där en användarsträng når en nyckel är `lib/import-storage.ts:25-27` via `path.extname(fileName)`, som bara läser basnamnet.
- **`book-downloads` och `book-imports` är privata** (`public: false`). Betalda e-boken och råa manus är inte publikt nåbara.
- **Budgetreservationen är atomisk** — `lib/workers/budget.ts:95-119` är ett enda Lua-EVAL med GET, jämförelse och INCRBY. Två samtidiga jobb kan inte båda passera. `releaseBudget` (`:124-148`) är korrekt och idempotent och vägrar återbetala över en dygnsgräns.
- **Granskarkedjans PASS går inte att förfalska** från manustexten. Verdiktet beräknas i TypeScript (`pipeline.ts:164`) från en array som passerat `json_schema`, Zod och citatförankring mot källtexten. Trohets- och stilgranskarna kör som separata anrop med skilda systemprompter. Kedjan failar stängt vid granskarfel.
- **Längdtak finns på varje betald väg.** Inga obundna retryloopar någonstans; alla BullMQ `attempts` är 2–3.
- **Alla 44 rate limiters på granskad gren passerar distinkt namn.** Kollisionsfixen är komplett.
- **Autosave-racet vid kapitelbyte existerar inte.** Alla tre `TiptapEditor`-monteringar har `key={selectedChapter.id}`, och `selectedChapter` härleds strikt från `selectedChapterId`. Kapitel A:s text kan inte nå kapitel B:s rad.
- **Ingen oautentiserad väg till en betald modell.** Elva genereringsroutes kontrollerade.

---

## Systemisk observation

### Ett antimönster, tre instanser

Tre granskare hittade oberoende samma fel i olika tabeller:

| Tabell | Policy | Privilegierad kolumn |
|---|---|---|
| `profiles` | UPDATE utan kolumnlista | `role`, `demo_mode` |
| `ai_jobs` | UPDATE utan kolumnlista | `output.audioBucket` |
| `audiobook_assets` | INSERT utan fältvillkor | `audio_bucket` |

Varje policy är korrekt formulerad kring **raden** — "din egen rad" — och fel formulerad kring **fältet**.

> **Regel att skriva in:** en kolumn som bara en privilegierad process fyller i får aldrig omfattas av en användar-UPDATE eller INSERT-policy utan explicit kolumnlista, och dess `UPDATE`-GRANT till `authenticated` ska återkallas.

Tre buggar, en regel.

### Migrationerna känner inte till era policyer

25 policyer live på `storage.objects`, betydligt fler än migrationerna definierar. Konkret drift:

- `book_covers_select_public 1uu3agi_0` **och** `storage_book_covers_select_public` — två policyer som gör samma sak. Suffixet `1uu3agi_0` är Supabase-dashboardens autogenererade namn.
- `book_covers_delete_own 1uu3agi_1` har `polcmd = r`. En SELECT-policy med ett namn som säger delete.
- `profiles public read public writers` finns live men i ingen migration.

RLS-policyer är PERMISSIVE och OR:as ihop. En fix skriven i en migration kan bli tyst OR:ad öppen igen av en dashboard-policy ingen ser. Det är tredje gången samma mönster biter — `20260910130000_chapters_single_select_policy.sql` finns just därför.

M3 är alltså inte en detalj: så länge grinden bara inventerar SELECT på `chapters`, är resten av driften osynlig.

---

## Ej kört

Följande redovisas som **ej kört**, inte som godkänt:

- **Innehållet i `chapter-media`.** Bucketen är publik och oskyddad; om den innehåller bilder ur betalda böcker är M1 en betalväggsläcka. Enda frågan i rapporten som inte kan besvaras från koden.
- **Trigger-listan på `public.profiles`.** Frågan kördes men SQL-editorn visade bara sista satsens resultat. I migrationerna finns endast `update_profiles_updated_at` (`20260304000000:301-302`), en tidsstämpel. `REVOKE` är rätt åtgärd oavsett svar. Kör ensam:
  ```sql
  select tgname from pg_trigger
  where tgrelid = 'public.profiles'::regclass and not tgisinternal;
  ```
- **Aktivt prov av BLOCK-S1-02.** Ingen INSERT eller signerad URL har begärts. Kedjan är bevisad i kod, inte utförd.
- **Anonym sond mot en publicerad betald bok.** Kräver att en sådan bok finns. Vid QA-passet 10 september fanns ingen, vilket betyder att den kontrollen aldrig har körts på riktigt.
- **Prod-env för `NEXT_PUBLIC_MARKETING_ENABLED`** (avgör om C1 är aktiv).
- **Kvalitetskedjan på kandidaten.** `src/lib/ai/translation-quality/**` finns inte på granskad gren; den ligger omergad i `translation-quality-20260914`. S1 har inte rensat kod på kandidaten, eftersom kandidaten inte innehåller den. AI-02:s integration har den granskningen framför sig.

---

## Rekommenderad ordning

| Ordning | Åtgärd | Ägare | Varför där |
|---|---|---|---|
| 1 | Gör de tre `check:*` strikta på `problems > 0` och crash | QA/release | Utan detta kan ingen efterföljande fix bevisas |
| 2 | `REVOKE UPDATE (role, demo_mode) … FROM authenticated` | DB | Största hålet, minsta åtgärden, bryter inget |
| 3 | Droppa de två `*_select_authenticated`-policyerna | DB | Bekräftad live |
| 4 | Fyra bucket-rader + droppa `ai_jobs_update_own` | B1 | Stänger betalväggsbypassen |
| 5 | Import: flytta raderingen efter sista batchen | B2 | Manusförlust |
| 6 | Översättning: skriv till ny version, växla vid klart | B2 | Bryter G3 ordagrant |
| 7 | Ljudbok: kontrollflaggor till egna kolumner | B2 | Budget + användarkontroll |
| 8 | Autosave: backoff-dränering + `beforeunload` | E1 | E1 äger filen |
| 9 | `with_check` i `policy_inventory` + inventera skrivpolicyer | QA | Gör driften synlig |

Punkt 1–4 är oberoende av varandra och kan gå parallellt. Ingen av åtgärderna kolliderar med filägarskapen för E1, X1, F1 eller AI-uppdragen.

---

## Verifieringskriterier för fixpaketet

Fastställda **före** fixen, av granskaren, enligt arbetsregel 3 ("en granskare som inte skrev ändringen"). CSO förblir read-only; Codex äger koden. Ett fynd stängs när kriteriet nedan är uppfyllt, inte när diffen ser rimlig ut.

### Vad som inte räknas som bevis

- "Åtgärdad" utan ett kommando och dess utfall.
- Ett grönt `qa:beta` **innan** blockerare 1 är fixad — grinden kan inte faila förrän dess.
- En migration som är skriven men inte bevisat applicerad. Ett grönt `migration list` visar att liggaren är överens, inte att schemat ändrades.
- Ett test som bevisar att den nya koden fungerar, utan ett test som failar om fixen backas ur.

### Per blockerare

| # | Kriterium för stängning | Bevisform |
|---|---|---|
| **0** | `information_schema.column_privileges` visar **inget** `UPDATE` för `authenticated` på `profiles.role` och `profiles.demo_mode`. Admin-flödena för rolltilldelning fungerar fortfarande (`api/admin/users`, `api/admin/author-applications`), och demo-toggeln fungerar via sin serverroute | SQL-utdata före/efter + en manuell genomgång av de tre flödena |
| **1** | Ett riktat test som injicerar ett fejkat problem i vardera `check-rls-paywall`, `check-billing-catalog` och `check-stripe-webhook` och bevisar exit 1 **utan** `--strict`. Separat test som bevisar att en skip fortfarande ger exit 0 utan flaggan | Testutfall. Detta är det enda fyndet där jag kräver ett regressionstest — utan det kan grinden tyst återgå |
| **2** | Ingen av de fyra platserna läser bucket från DB-rad eller JSONB. `grep -rn "audioBucket\|audio_bucket" src/app/api/` visar endast `getAudiobookStorageBucket()`. `ai_jobs_update_own` finns inte i `pg_policy`. Ljudboksuppspelning och jobblistan fungerar fortfarande | Kodläsning + SQL + en manuell uppspelning |
| **3** | `pg_policy` för `storage.objects` innehåller varken `storage_audio_outputs_select_authenticated` eller `storage_content_assets_select_authenticated`. Behörig uppspelning fungerar fortfarande via signerad URL | SQL före/efter + manuell uppspelning |
| **4** | Import med avsiktligt framkallat batchfel lämnar utkastet **oförändrat**, inte tomt. Verifiera kapitelantal och text före och efter | Reproduktion med riktig fil, kapitelantal före/efter |
| **5** | Översättning med overwrite som avbryts mitt i lämnar den tidigare godkända översättningen intakt. Detta är G3:s ordalydelse och ska provas, inte resoneras om | Reproduktion, kapitelantal och text före/efter |
| **6** | Offline-simulering: skriv, koppla ner, se felet, koppla upp, **vänta utan att skriva** → texten sparas ändå. Reload med osparat innehåll ger varning | Browserprov, inte enhetstest |
| **7** | Avbryt klickat (a) medan jobbet ligger i kön och (b) mitt i kapitel 2 stoppar genereringen i båda fallen. Kontrollera att inga ytterligare ElevenLabs-anrop sker efter avbrottet | Jobb-ID, loggar och faktiskt kreditsaldo före/efter |

### Efter integration

Kandidaten testas om i sin helhet — deltester från enskilda fixar räcker inte. Jag granskar då:

1. Att inget fynd återintroducerats av en annan fix i samma filer.
2. Att de fyra RLS-/GRANT-ändringarna faktiskt syns i produktionsdatabasen, inte bara i migrationsfiler. Detta projekt har divergerat tre gånger på exakt den punkten.
3. Att `qa:beta` nu **kan** faila — bevisat, inte antaget.

### Kvar att stänga oberoende av Codex

- Innehållet i `chapter-media` (Svea eller QA).
- Trigger-listan på `public.profiles` (en SQL-rad).
- Prod-värdet för `NEXT_PUBLIC_MARKETING_ENABLED` (avgör om C1 är aktiv).

---

## Metod och begränsningar

Granskningen är en strukturerad kodläsning plus fyra read-only SQL-frågor mot produktionsdatabasen. Fem parallella granskaruppdrag täckte isolering, lagring, betalvägg, AI-missbruk och dataförlust; varje blockerare omverifierades av huvudgranskaren mot källkoden före rapportering. Fynd markerade *granskarrapporterat* har inte genomgått den andra verifieringen och bör kontrolleras innan de åtgärdas.

Detta är **inte** ett penetrationstest och ersätter inte en professionell säkerhetsgranskning. En kodläsning kan missa subtila sårbarheter och missförstå komplexa behörighetsflöden. Inget fynd här ska tolkas som att den kontrollerade ytan i övrigt är säker; frånvaro av fynd i ett delsystem betyder att jag inte hittade något, inte att där inte finns något.

Inga provideranrop, kontoskrivningar, installationer eller driftsättningar har utförts. Ingen fil i repot har ändrats.
