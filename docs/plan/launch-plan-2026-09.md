# Verkli — Lanseringsplan 20 september 2026

> **Ägare:** @SveaHallinder · **Skapad:** 2026-08-17 · **Branch:** `platform`
> **Ersätter:** Bilaga 1 i Fredrik-erbjudandet (aldrig signerat, aldrig levererat).
> **Kompletterar:** `Verkli_Produktionsplan_och_lanseringsplan_2026` (12 aug) — dess
> lanseringskriterier §9 och checklista §19 är acceptanskriterier här.
> **Beskär:** `docs/roadmap.md` (898 rader, skriven före tidspressen). Se §3.

## 0. Läget i en mening

Problemet är inte att funktioner saknas. Problemet är att **mycket är byggt men
overifierat, avstängt eller fejkat — och ingenting är driftsatt.**

| Fakta | Källa |
|---|---|
| 34 dagar till soft launch, 38 till Bokmässan | Produktionsplan §7 |
| Fredrik: 0 commits, 0 signerade avtal, 0 IP-anspråk, 0 aktier utgivna | `git log --all`, term sheet §4.6 |
| `npm run lint` + `npm run build` gröna | verifierat 2026-08-17 |
| 93 migrations, 7 BullMQ-köer, 7 workers, ~50 reader/author-routes | infra-inventering |
| Plattformen är **inte driftsatt någonstans** — `verkli.com` = Vercel → `/waitlist` | DNS + headers |
| Workers har **aldrig** körts i prod | `docs/sprint-0.5-deferred.md` D4 |
| Alla feature flags default OFF, alla `NEXT_PUBLIC_*` = **bakade vid build** | `lib/flags.ts:4-6` |

Konsekvensen av sista raden: **varje flaggbeslut måste tas innan launch-bygget.**
En flagga kan inte flippas i produktion utan redeploy.

---

## 0b. Genomfört 2026-08-17 (ocommittat i arbetsträdet)

Gate: `npm run qa:beta` från `apps/web` — alla 7 steg gröna, 1106 tester.
**Codex-reviewen kunde inte köras** (usage limit på OpenAI-kontot till 23 aug), så
den grinden är obesatt på denna diff. Fail-closed enligt skillens regel: det är en
verifieringslucka, inte ett godkännande.

| Vad | Var |
|---|---|
| **Dynamiska betalmetoder.** De 8 hårdkodade `payment_method_types[0]=card` borta. Stripes API-referens: *"You can omit this attribute to manage your payment methods from the Stripe Dashboard."* `automatic_payment_methods` är **inte** en Checkout-Session-parameter — utelämnande är mekanismen. Swish/Klarna/wallets kan nu slås på från Dashboard **utan redeploy**. | `lib/payments/stripe.ts` |
| **Terminalhantering för fördröjda betalningar.** `checkout.session.async_payment_failed` och `.expired` föll tidigare till `default → ignored`, vilket lämnade ordrar `pending` för evigt. Nu reconcilieras `orders`/`donations`/`credit_topups`/`pod_orders`, guardat på `status = "pending"` så en betald rad aldrig nedgraderas. Kastar vid DB-fel så `stripe_events`-raden rullas tillbaka och Stripe gör retry. | `stripeWebhook.handlers.ts` + 8 nya tester |
| **Dubbeldebiteringsrisken stängd.** `confirmStripeBookPurchase` markerade ordern `failed` när `payment_status !== "paid"` — vilket för Klarna/Swish träffar en köpare som *har* betalat, och `/purchase/success` sa "try again". Eftersom entitlement ännu inte finns hade 409-guarden i checkout inte stoppat en andra session. Returtypen är nu `"paid" \| "processing" \| "failed"`, och copyn säger uttryckligen att man inte ska betala igen. | `lib/payments/purchase.ts`, `purchase/success/page.tsx` + 2 tester |
| **ffmpeg i worker-imagen.** `npm ci --ignore-scripts` blockerar `ffmpeg-static`s postinstall, så binären fanns aldrig. Nu systemffmpeg + `FFMPEG_BIN` bakat in. Detta var orsaken till att varje helboksjobb degraderade till manifest-only och ändå rapporterade success. | `Dockerfile.workers`, `Dockerfile.worker.audiobook` |
| **Redis `family: 0`.** Railways privata DNS resolvar till IPv6/dual-stack; ioredis når den inte på default-lookupen. Railways egen BullMQ-guide sätter exakt `family: 0`. Inert lokalt och för publika hosts, så imagen förblir portabel. | `lib/env.ts` + 1 test |
| **Compose-driften rättad.** `env_file` pekade på root-`.env.local`, som definierar en Supabase-variabel koden aldrig läser och saknar den den kräver. | `docker-compose.workers.yml` |
| **Deploy-dokumentation.** Minsta tjänsteuppsättning, tjänst-för-tjänst-uppsättning, variabelmatris, verifieringsprocedur. | `docs/railway-deployment.md` |

Kvar i W0.2 som bara Svea kan göra: skapa Railway-projekt, lägga till betalning,
skapa Redis + de två Phase 1-tjänsterna. Se `docs/railway-deployment.md`.

## 0c. Genomfört 2026-08-18 — Wave 1, parallella agenter

Fyra paket kördes parallellt i isolerade git-worktrees. Brancher: `wp/NN-…`,
ingen pushad, `platform` orörd.

| Paket | Branch | Grind |
|---|---|---|
| WP-14 penningbuggen + rösfällan | `wp/14-pricing-voice` (`7a052ae`) | 7/7, 1124 tester |
| WP-03 lyssningsmätning + position | `wp/03-listen-analytics` (`409b87f`) | 7/7, 1168 tester |
| WP-04 supportvägen | `wp/04-support-path` (`d423ff1`) | 7/7, 1146 tester |
| WP-01 köptratten | `wp/01-buyer-proof` (`ca97253`) | 7/7, 1207 tester |

**Sammanslaget resultat:** `integration/wave1` — alla fyra mergade **rent** (noll
överlappande filer, filägandet höll), plus en femte commit som tätar signup.
`qa:beta` på det sammanslagna trädet: **7/7, 1323 tester** (från 1106 = +217).
Grön grind per branch bevisar inget om kombinationen; detta gör det.

Kvar innan `platform`: se codex-reviewen nedan (körd 2026-08-24).

## 0d. Codex-review 2026-08-24 — grinden är körd, alla 19 fynd åtgärdade

Grinden som stod "blockerad till 23 aug" är avklarad. Reviewen kördes mot
`origin/platform` som bas (11 commits, 106 filer, 7 792 rader).

**Körsätt, för reproducerbarhet:** hela diffen stallade på 330s-taket vid
`model_reasoning_effort=high`, så den kördes uppdelad — de fem WP-commitarna var
för sig (`codex review --commit <sha>`) på `medium`, och mina två UI/design-sync-
commits på `high`. Mergecommitarna granskades inte separat: de bär inget eget
innehåll (filantalen matchar WP-commitarna exakt, vilket också bekräftar att de
mergade rent). **Två kända luckor:** reducerad effort på Wave 1, och per-commit-
scope betyder att interaktioner *mellan* paketen inte är granskade — `qa:beta`
7/7 på det sammanslagna trädet täcker en del av det, inte allt.

| Paket | P1 | P2 | P3 |
|---|---|---|---|
| WP-14 pricing/voice (`7a052ae`) | 2 | 1 | – |
| WP-03 lyssningsmätning (`409b87f`) | 1 | 3 | – |
| WP-04 supportvägen (`d423ff1`) | 1 | 1 | 1 |
| WP-01 köptratten (`ca97253`) | 1 | 3 | – |
| signup `?next=` (`17d1b16`) | 2 | 2 | – |
| UI-fixar + design-sync (`444ac58`, `98acde2`) | 0 | 1 | – |
| **Totalt** | **7** | **11** | **1** |

**Alla 7 P1:or är fixade** (lint 0, 1 334 tester gröna, `next build` grön):

1. **Betald bok som avpublicerades blev en död länk.** `reader/read/[chapterId]/page.tsx`
   avvisade icke-`PUBLISHED` *före* `getReadAccess`. Nu resolvas entitlement först, och
   en avpublicerad bok är fortfarande läsbar för den som köpt den (`purchased`/`plus`) —
   men inte via `free`/`first_chapter`, för avpublicering ska ta bort publik räckvidd.
2. **299 kr togs ut innan röst-guarden.** Guarden i `generate/route.ts` låg efter
   Stripe-redirecten. Samma guard ligger nu i `audiobook/checkout/route.ts`, före
   sessionen skapas — den enda punkt som faktiskt är före betalning.
3. **Preflight och worker var oense om env-var.** Routen accepterar `TTS_VOICE_ID`,
   men `assertElevenLabsEnv()` krävde `ELEVENLABS_VOICE_ID`, så jobbet köades och dog.
   Assertionen tar nu emot den redan resolvade rösten. Workerns `|| "default"`-fallback
   är också borta — "default" är ingen riktig ElevenLabs-röst, alltså samma fälla som
   "Ryan".
4. **Kapitelbyte skrev position på fel kapitel.** `ManifestAudiobookPlayer` höll
   `activeTrackSrc` och `chapterId` som separata states, så trackern fick nytt
   kapitel-id medan gammal källa spelade. Nu är källan bunden till sitt kapitel-id
   i ett värde, vilket gör tillståndet orepresenterbart istället för ordningsberoende.
5. **Anonyma supportinlägg persisterades inte** — se den uppdaterade sektionen nedan.
6. **E-postsignup gick aldrig via `/auth/callback`.** `signUp()` saknade
   `emailRedirectTo`, så `verkli_next`-cookien varken konsumerades eller rensades.
7. **`next` tappades i signin → signup.** "Skapa konto"-länken var hårdkodad utan
   parameter — och det är den vanligaste köpvägen, inte ett kantfall.

Plus en P2 som följde av #2/#3: den nya felkoden `AUDIOBOOK_VOICE_UNCONFIGURED`
ersätter `AUDIOBOOK_FEATURE_DISABLED` på röst-vägen, så författar-UI:t slutar säga
"the audiobook feature is not enabled" när flaggan i själva verket är på.

**Alla 11 P2:or och P3:n är också åtgärdade** (`ceba5d1`) — reviewen har inget kvar.
1 340 tester gröna, lint 0, build grön.

- **Pengar och åtkomst:** `sendPurchaseReceipt` awaitas nu i både webhooken och
  `purchase.ts` (den lösa promisen kunde dödas när svaret returnerades, och då var
  kvittoclaimet redan förbrukat). Köp-hyllan behåller kapitelkornigheten i
  `entitlements`, så ett per-kapitel-köp inte längre länkar till bokens *första*
  kapitel — ofta ett köparen inte äger. Orderhistoriken slutar länka avpublicerade
  böcker till den publika boksidan som 404:ar.
- **Lyssning:** positionsskrivningar serialiseras i `useListenTracking` (routens
  upsert är medvetet last-write-wins och läste ankomstordning som spelordning).
  Modererande admin kan tracka opublicerade böcker, som i play-routen. Kapitel
  ≤15s markeras inte längre avlyssnade vid start — tröskeln för långa kapitel är
  oförändrad (600s completar fortfarande vid 585s, inte 540s).
- **Support och auth:** supportformuläret kräver svarsadress när man är utloggad
  (auth-läget kommer nu från server-komponenten). Carry-cookien lever 2h istället
  för 600s, eftersom e-postbekräftelse begränsas av hur länge någon dröjer med
  inkorgen — och den rensas nu när registreringen misslyckas, på både e-post- och
  Google-vägen. `sitemap.ts` pekar på `/support` istället för den redirectande
  `/reader/faq`.
- **Verktyg:** `build-css.sh` bootstrappar sin egen CLI, pinnad till repots egen
  `tailwindcss`-version. Verifierat genom att flytta undan CLI:n och köra om.

### ⚠️ Migration som måste appliceras av Svea

WP-03 skapar `listening_positions`, som **inte finns i live-databasen** (probe:
`PGRST205 Could not find the table`). Tills den är applicerad fungerar
lyssnings*events* och uppspelning normalt — bara position-spara/återuppta är inert,
loggat på warn med migrationsfilnamnet i hinten.

```bash
cd /Users/admin/verkli-web/apps/web && npx supabase db push
```

Applicerad och verifierad mot ett kastbart lokalt Postgres-kluster: idempotent vid
omkörning, RLS på med fyra användarscopade policies inklusive `WITH CHECK` på UPDATE,
check-constraint avvisar negativa positioner, kapitelborttagning kaskaderar.

### Öppna fynd från Wave 1 som ingen ägde

Alla verifierade, ingen åtgärdad — de låg utanför respektive agents filägande.

| Fynd | Var | Varför det spelar roll |
|---|---|---|
| `books.user_id` finns inte | `lib/payments/pod-fulfillment-email.ts:74` | Kolumnen heter `author_id`. POD-operatörsmailet resolvar aldrig författaren, så en betald tryckorder saknar avsändarinfo. |
| `voiceId \|\| "Rachel"` | `audiobook/preview/route.ts:105` | "Rachel" *är* en riktig ElevenLabs-röst, så inget kraschar — förhandsvisningar läses tyst upp i fel röst när konfig saknas. Sämre felmod än en 4xx. |
| Felgränser saknar footer | `(app-reader)/error.tsx`, `(reader-browse)/error.tsx` | De ersätter shellen när de utlöses, så exakt när användaren behöver support finns ingen supportlänk. |
| `/faq` (author-varianten) | `(public-author)/faq/page.tsx` | Fortfarande "Help center" med löftet *"Reach out and we'll help"* utan mekanism. Bara reader-varianten är omdirigerad. |
| Inget "Resume from 05:12" | `ChapterAudiobookPlayer` | Med `preload="none"` sker seeken först vid play, så positionen sparas men syns inte. Fungerar, men läsaren ser inte att platsen behölls. |
| `audio_requested` räknar författarpreviews | `play/route.ts` | `props.isAuthorPreview` finns att filtrera på — den som bygger funnel-dashboarden måste veta det. |

### 🔴 Blockerare: `feedback`-tabellens RLS har driftat från migrationen

WP-04 verifierade ett anonymt formulärinlägg end-to-end och fick **500
`FEEDBACK_SAVE_FAILED`**. Serverloggen ger orsaken:
`new row violates row-level security policy for table "feedback"`.

Migrationen `20250209000000_user_flags_and_feedback.sql:45-47` har
`WITH CHECK (auth.uid() = user_id OR user_id IS NULL)`, vilket **tillåter** det.
Alltså har den **live-policyn driftat**. Inloggade inlägg bör fortfarande gå igenom
(`auth.uid() = user_id`), men anonyma gör det inte — och anonyma är precis de som
behöver supportformuläret mest.

Konsekvens: **den primära CTA:n på den nya `/support`-sidan failade för oinloggade
besökare.** WP-04 gjorde det den kunde inom sitt filägande — felcopyn dead-endar inte
längre, den namnger e-postalternativet — men själva fixen krävde en migration eller
`api/feedback/route.ts`, båda utanför dess ägande.

**✅ Åtgärdat 2026-08-24 på route-nivå (codex P1 #5).** `api/feedback/route.ts` väljer
nu skrivklient efter auth-läge: anonyma inlägg går via service-rollen, inloggade
stannar på den user-scopade klienten så RLS fortsätter tvinga `auth.uid() = user_id`.
Säkert eftersom `user_id` alltid härleds ur sessionen och aldrig ur bodyn — en anonym
avsändare kan bara skriva `NULL` som författare — och zod-schemat plus den
IP-nycklade rate-limitern gattar innehållet. Två tester låser fast valet av klient
i båda riktningarna.

**Detta tar bort blockeraren men inte skulden.** Route-fixen gör bara att koden slutar
*bero* på den driftade policyn; policyn är fortfarande fel jämfört med migrationen, och
vilken annan väg som helst in i `feedback` träffar den igen. Reconciliationen nedan
gäller alltså fortfarande, och `feedback` hör till det som ska verifieras där.

### ⚠️ Systemiskt: migrationerna beskriver inte live-databasen

Detta är nu **tre oberoende bekräftade fall** av att repots migrationer inte stämmer
med produktionsdatabasen:

1. `audit_log` — live använder `entity_type`/`meta`/`created_at`, migrationen säger
   `target_type`/`metadata`/`occurred_at`
2. `analytics_events` — migrationen påstår "service role only", men en senare
   migration lade till en användar-INSERT-policy utan `TO`-klausul
3. `feedback` — live-policyn avvisar det migrationen uttryckligen tillåter

Plus `20260429160000_voice_cloning_and_karaoke.sql`, vars tre tabeller inte finns i
genererade `types.ts` — antingen oapplicerad eller stale typer.

**Åtgärd före 20 september:** en reconciliation av migrations mot live-schema. Vi är
på väg att driftsätta workers som antar schemaformer. Att lita på migrationerna som
beskrivning av verkligheten är inte längre försvarbart.

**Praktisk följd nu:** kör **inte** `npx supabase db push` blint. Kör först
`npx supabase migration list` och se exakt vad som är opplicerat — `db push` applicerar
allt pending, inte bara `listening_positions`.

### RLS-frågan är löst — och migrationerna hade fel om sig själva

Planen antog tidigare att `book_view` och `start_reading` möjligen tappades tyst
mot en service-role-only-tabell. **De tappas inte.** Live-probe:

`20250209000001_analytics_events.sql` skapar tabellen utan policies och påstår
"service role only". Men `20250210000000_bookmarks.sql:33-36` lade senare till
`analytics_events_insert_own` med `WITH CHECK (auth.uid() = user_id OR user_id IS NULL)`
— **utan `TO`-klausul**, så den gäller `anon` och `authenticated` lika. Live-tabellen
innehåller **187 `book_view`- och 11 `start_reading`-rader**. Båda call sites fungerar.

Notera att detta inte påverkar §4b:s fynd om författarstatistiken: det handlar om
**SELECT**, som fortfarande är blockerad (anon select → 0 rader, inget fel, tyst
filtrerad). *Rättelse 2026-09-04: WP-15:s huvuddel är levererad sedan detta skrevs
(`9bc37f6`+`0026ba7`) — se §0e. SELECT-mekanismen ovan står kvar och är exakt varför
admin-klienten är bärande.*

**Den verkliga faran är subtilare:** allt hänger på PostgRESTs `return=minimal`. Att
lägga till `.select()` eller `.single()` på inserten i `logAnalyticsEvent` skulle tyst
döda varje läsarevent med ett 42501 som `.catch(() => {})` sväljer. Nu dokumenterat i
`lib/analytics/events.ts` med probe-resultaten inline.

**Två dokumentfel att rätta (ej gjorda):**
- `docs/DATABASE_ARCHITECTURE.md:257` listar `analytics_events` under "Service role
  only (no user write policies)" — fel, det finns en användar-INSERT-policy.
- Kommentaren i `api/books/[id]/publish/route.ts:551-553` ("analytics_events RLS blocks
  the author session") är fel som formulerad. Admin-klienten där är ändå rätt, av ett
  annat skäl: en admin som publicerar någon annans bok skriver `user_id != auth.uid()`,
  vilket `WITH CHECK` genuint avvisar.

### Operativt om worktrees (kostade två agenter tid)

- **Worktrees skapas utan installerade beroenden.** `apps/web/node_modules` är tom,
  Node resolvar uppåt till root och ger zod v4 istället för deklarerade v3 samt inga
  `@vercel/*`. `check:dead-code` failar då med ~6 typfel i filer agenten aldrig rört.
  Kör `npm ci` i worktreet först — **grinden är inte meningsfull innan dess.**
- **Worktrees skapades från fel bas** (`414de4c` = `feat/beta-apply`, inte `platform`).
  Verifiera med `git log -1 --oneline` innan arbete börjar.
- **Rate limiters är modulnivå och överlever `vi.clearAllMocks()`.** Tester som träffar
  samma route upprepat behöver eget användar-id, annars ger de ett riktigt 429 mitt i
  sviten som ser ut som en kodbugg.

## 0e. Granskning 2026-09-04 — två av planens egna premisser var fel

Sexton agenter (sju parallella läsare, en adversariell verifierare per tråd med
default-hållning REFUTERAT, plus syntes och en fullständighetskritiker) läste om fyra
trådar. **Tolv fynd föll vid verifiering** — två av dem påståenden som stod i denna plan.
Rättelserna är inskrivna på plats i §4b, §5 och §7; detta är loggen och de nya fynden.

### ✅ Läckan mellan författare finns inte, och har aldrig funnits

Planens säkerhetsnot i §4b och riskraden i §7 påstod att `author/stats/books/route.ts:44-46`
selekterar `analytics_events` utan författarfilter. **Refuterat på tre oberoende grunder,
var och en tillräcklig:**

1. Rad 44-46 innehåller ingen fråga. De är en early return —
   `if (owned.books.length === 0) { return NextResponse.json({ books: [] }); }`. Planen
   citerar en version som ersattes av `9bc37f6`, vilket är en ancestor till platform HEAD.
2. Den ofiltrerade frågan *fanns* (i `3bc0493`) men körde på **session-klienten**.
   `analytics_events` har RLS påslaget med exakt en policy i hela migrationsträdet —
   `analytics_events_insert_own`, `FOR INSERT WITH CHECK`, ingen `TO`-klausul — och
   **ingen SELECT-policy alls**. RLS på utan SELECT-policy är deny-all. Läsningen
   returnerade noll rader för varje anropare. Det var död kod, inte en läcka som väntade
   på en policy.
3. Nuvarande route *håller* en service-role-klient, vilket är den farliga konfiguration
   planen fruktade — men varje läsning ur den är begränsad av `.in("book_id", bookIds)`,
   och `bookIds` kommer från `resolveAuthorBooks`, som filtrerar med explicit
   `.eq("author_id", userId)`. Scopingen beror alltså inte på `books`-RLS över huvud taget.

Planens formulering *"ofarligt bara så länge RLS är tomt"* är den del som är sakligt fel,
och den **inverterar risken**: `analytics_events`-RLS är inte tom, den är deny-by-default
för SELECT — den starkaste hållning som finns, inte en lucka.

**Kvarstående, verkligt men annat:** `api/books/[id]/stats/route.ts` scopar ~8
service-role-läsningar på en path-parameter som anroparen styr, och det enda som hindrar
korsåtkomst är en JavaScript-jämförelse i `getBookAsOwner`. Korrekt idag och failar
stängt, men utan databasbackstop under sig. Regressionstestet som vaktar mönstret täcker
3 routes och grepar bara efter `analytics_events`, så orders/reviews/bookmarks/readings
och tre server-komponenter är otäckta.

### ✅ WP-15:s huvuddel är redan levererad

`9bc37f6` och `0026ba7` gjorde det planen fortfarande beskrev som öppet. Alla fem routes
under `api/author/stats/**` och `api/books/[id]/stats/**` resolvar ägarskap med den
RLS-backade session-klienten och läser aggregat med `createAdminClient()` — delat kontrakt
i `lib/author/stats-scope.ts:43-62`. De hårdkodade `sales: 0` / `comments: 0` är borta.
`'completed'` är ersatt av `SETTLED_PAYMENT_STATUS = "paid"`, vilket matchar DB:ns
CHECK-constraint `status IN ('pending','paid','failed')` — `'completed'` är alltså
**oskrivbart** och splitten är löst, inte bara enad. Fyra defekter kvarstår, se §4b.

### 🔴 Nytt: köpvägen är armerad att gå sönder — inte trasig idag

Ingen av de två middleware-allowlistorna innehåller `/order` eller `/api/order`
(`middleware.ts:150-157` för `NEXT_PUBLIC_WAITLIST_ONLY`, `:202-212` för `BETA_LOCK`).
En order-POST matchar ingen post i någon av dem.

Probe mot produktion 2026-09-04:

| Väg | Svar | Tolkning |
|---|---|---|
| `/` och `/reader/discover` | 200 | båda låsen är **av** just nu |
| `/api/order/ta-for-er` | 405 | routen finns och är driftsatt (GET nekas, POST tillåts) |
| `/apply` | 404 | prod bygger **platform**, inte `main` — `8cf08f6` finns alltså inte i prod |

Ordrar fungerar alltså idag. Men `BETA_LOCK` är precis den flagga som slås på för en
betakohort, och när den slås på renderas waitlist-sidan fortfarande medan dess köpknapp
dör tyst: 307 till HTML under `WAITLIST_ONLY`, 403 JSON under `BETA_LOCK`. Eftersom
`NEXT_PUBLIC_WAITLIST_ONLY` *var* grinden under waitlist-perioden var köpknappen trasig
då. Fixen finns som `8cf08f6` på `feat/beta-apply` och ska cherry-pickas, plus samma
tillägg i `BETA_LOCK`-blocket som sidobranchen aldrig täckte.

**Detta är `wp/17-order-path-unlock` och ligger först i ordningen.** Notera att
`79a9e19` (mobilfixen) stängde den kosmetiska halvan av samma buggrapport och lämnade den
funktionella halvan öppen.

### ✅ Branch-kyrkogården är en branch med fem namn

`feat/beta-apply`, alla fyra `worktree-agent-*` och `origin/main` är **samma commit**:
`414de4c`. "main är 38 commits före platform" är alltså en inaktuell lokal pekare på
marknadsföringslinjen, inte ett förråd av tappat arbete.
`cursor/development-environment-setup-df5d` är samma main plus en commit som lägger till
`AGENTS.md`, vilket platform redan har. `design/author-black-buttons-restore` och
`mvp-wip-2026-03-18` är också identiska (`2ebef8d`).

Merge-basen är `05fbf1a` (2026-01-31) och platform är 481 commits före den.
`git merge-tree platform feat/beta-apply` ger **237 konfliktfiler**. En riktig merge är
utesluten — cherry-picka enskilda commits, aldrig merga branchen.

Av 13 undersökta brancher håller **exakt två** kod platform saknar: `mvp-wip-2026-03-18`
(en RESTRICTIVE deny-write-RLS-migration på orders/entitlements/audit_log som platform
inte har någon motsvarighet till, plus PRO+-tier och 3-nivåers prissida — `b528ba6` kan
cherry-pickas oberoende av billing-delarna) och `codex/test-reader-book-entitlements`
(perf/lazy-load plus två testfiler). Allt annat är superseded.

⚠️ **Innan någon kör ett städskript:** fyra `wp/*`-brancher visar 0 ahead och ser ut som
självklara delete-kandidater, men är utcheckade i live-worktrees under
`.claude/worktrees/`. Att radera dem bryter körande worktrees. Och lokal städning missar
det mesta — origin bär brancher utan lokal motsvarighet, som inte är diffade.

⚠️ `beta_applications` finns i live-databasen (`types.ts:507`, lagt av `3ac2648` som
regenererade typer mot prod) medan varje rad kod som läser eller skriver den bara finns på
`feat/beta-apply`. `/apply` 404:ar på platform. Platform har sitt *eget*
`api/author-applications` som kräver att en admin godkänner. **Ingen har fastställt vilken
URL den nuvarande betakohorten fick, eller om någon dränerar pending-kön.**

⚠️ **Fällan i den branchen:** `ccae495` bultar HTTP Basic auth (delat lösenord i
`ADMIN_BASIC_AUTH_USER`/`PASSWORD`) på varje `/admin`- och `/api/admin`-väg. Att ta den
skulle ersätta platforms per-användar-Supabase-roller med ett delat lösenord, och om
env-varen är osatt ge 503 över hela det befintliga adminområdet. Ta **bara**
`isApply`/`isApiApply`-posterna, aldrig middleware-halvan.

### 🔴 Nytt: tio fynd säger "felet sväljs" — ingenting hade fångat dem

`instrumentation.ts:14` har `enabled: Boolean(dsn)`, så Sentry stänger av sig själv tyst
när `SENTRY_DSN` saknas. `SENTRY_DSN` förekommer **inte** i `lib/launch-config.ts` eller
`scripts/check-launch-config.ts` — launch-verifieraren, vars hela premiss är att
flaggbeslut måste tas före bygget, kräver inte DSN:en. Och det finns exakt **ett**
`captureException` i hela `src` (`global-error.tsx:14`); allt annat rider på
`onRequestError`, som fångar *kastade* fel. Varje sväljt fel i denna granskning är fångat
och släppt, aldrig kastat.

Dessutom: `check:launch-config` är **inte** ett steg i `qa:beta`
(`scripts/qa-beta.mjs:214-219` kör vitest, eslint, english-default, no-placeholders,
dead-code, build). Launchmatrisen finns som data med ett test bakom sig — och körs sedan
inte av det som kallas betagrinden. Lägg till den som ett steg.

### ⚠️ Fällan i den rekommenderade soft-delete-fixen

Två trådar föreslog att `useChapterCrud.ts:227` byter hard delete mot
`.update({ deleted_at })`. Ingen läste constrainten:
`20260204180000_fix_chapters_unique_constraint.sql:20` lägger
`UNIQUE (book_version_id, "order")` — **ovillkorlig**, inte ett partiellt index med
`WHERE deleted_at IS NULL`. En soft-deletad rad behåller sin order-plats för alltid,
samtidigt som `20260429121000_soft_delete_columns.sql` skapar en RESTRICTIVE SELECT-policy
som gömmer raden för klienten. Att shippa den föreslagna enradaren ger opaka 23505 mot en
**osynlig** rad — vid nästa kapitelskapande på den platsen och i sentinel-vandringen i
`handleMoveChapter`/`handleReorderChapters`.

`deleted_at` är alltså en halvfärdig funktion: kolumner och policies levererade, men
`lib/db`-hjälpmodulen som migrationens egen header pekar på finns inte på platform. Att
slutföra den kräver en genomgång av **varje** tabell som fick `deleted_at`, inte bara
`chapters`, och rätt migration är
`DROP CONSTRAINT chapters_book_version_id_order_key` +
`CREATE UNIQUE INDEX … WHERE deleted_at IS NULL` — verifierat mot live med
`pg_constraint` först. Eget paket, `wp/16b`, efter launch.

### 🔴 Nytt: `/order` och `/waitlist` ligger utanför english-default-grinden

`scripts/check-english-default.ts:15-35` definierar `SCOPE` som route-grupperna
`(app-reader)`, `(reader-browse)`, `(public-reader)`, `(app-author)`, `(public-author)`
plus vissa `components/`-kataloger. `order` och `waitlist` är **top-level-kataloger utan
route-grupp**, alltså aldrig i scope. De två publika, oautentiserade, pengatagande ytorna
är precis de två som english-first-grinden inte tittar på. Antingen är det svenska
medvetet — skriv då in undantaget i skriptets kommentar så nästa granskare slutar härleda
det igen — eller så ska katalogerna in i `SCOPE`.

### Ordning beslutad 2026-09-04

Sorterad efter skada-per-dags-fördröjning för betaförfattare, inte efter enkelhet.

| # | Paket | Insats | Varför här |
|---|---|---|---|
| 1 | `wp/17-order-path-unlock` | 0,5 d | Enda posten som kan förstöra pengar tyst. En fil, inget schema. Låsen är av idag, men `BETA_LOCK` slås på för kohorten. |
| 2 | `wp/16-autosave-integrity` | 3 d | Enda paketet där skadan är **oåterkallelig**. Betaförfattare skriver i editorn denna vecka; en tappad paragraf är borta för alltid och författaren vet inte varför. |
| 3 | `wp/20-mobile-touch-targets` | 1,5 d | Ligger på pengavägen, och fixarna är de lägsta i risk i hela planen. Beslutat: **adoptera `.input-base`/`.btn-primary`** ur DESIGN.md, inte 16 engångslappar. |
| 4 | `wp/15-stats-truth` | 1,5 d + donationsbygget | Trustskada men fullt reparerbar genom att shippa senare; ingen data förstörs medan den väntar. |
| 5 | `wp/18-waitlist-polish` | 0,5 d | Två cherry-picks. "Johan SvH" står på Stripe-radposten och köparens kvitto. |
| 6 | `wp/19-branch-hygiene` | 0,25 d | Git-only. Kör i luckorna medan en codex-pass eller `qa:beta` snurrar. |
| — | `wp/16b-chapter-revisions` | 3-4 d | **Efter 20 sep.** Enda arbetet som rör ett driftat live-schema, och en snapshottabell utan restore-UI är risk utan nytta. |

Parallellitet: filägandet är genuint disjunkt mellan alla sex, men den verkliga
serialiseringen är en utvecklare plus en obligatorisk codex-pass och en full `qa:beta` per
paket. **Öppna inte mer än två worktrees samtidigt**, kör `npm ci` i varje färskt worktree
innan något annat, och bekräfta basen med `git log -1 --oneline`.

---

## 1. Vad vi ärvde av Fredrik: ingenting — och det är rätt utfall

Term sheetet var icke bindande och blev aldrig signerat. Därmed aktiverades varken
IP-överlåtelsen (§6), leaver-reglerna (§5.3) eller aktieförvärvet (§4). Han har
noll commits i repot och `grep -ri spawnback` ger noll träffar i hela kodbasen.

**Vi bygger AI-lagret själva från grunden. Inget att karantänera, inget att förhandla,
420 000 kr och 5 % av bolaget kvar i huset.**

Kvar att stänga (endast Svea): ta bort honom från Vercel, Supabase (`glfipbnsyxowqsmcuzcm`,
org `owgiufrlnsttjtnlvses`, eu-west-3), GitHub `sveahall/verkli`, Stripe, ElevenLabs,
NVIDIA, Higgsfield, Resend, Google Workspace, domänregistrar — och rotera varje
nyckel han sett. Se W0.1.

---

## 2. AI-lagret: den faktiska statusen

Inventeringen är entydig: **ingen LLM-textleverantör är inkopplad någonstans i produkten.**

| Förmåga | Status | Var |
|---|---|---|
| TTS / ljudbok | **Riktig** — ElevenLabs `eleven_multilingual_v2` | `lib/tts/elevenlabs-tts-provider.ts:49` |
| Omslagsbild | **Riktig** — NVIDIA flux.1-schnell → SDXL failover | `lib/nvidia-sd3.ts:42-72` |
| Trailer-video | **Riktig** — Higgsfield image2video + ffmpeg | `lib/higgsfield.ts:84` |
| Översättning | **Riktig** — NVIDIA Riva + lokal OpusMT (sv↔en) | `lib/ai/providers/*` |
| Trailerns kreativa brief | **Fejk** — genre-lookup | `lib/ai/trailer-generation/generate.ts:23` |
| Marknadsföringstext | **Fejk × 5 oberoende implementationer** | `content-generation/generate.ts:158` m.fl. |
| Chattassistent | Riktig Llama-3.1-8B **men default OFF** → nyckelordsmatchning | `flags.ts:157-163` |
| Redaktionell manusanalys | **Finns inte** | — |
| Publishern / Redaktören | **Finns inte** — noll träffar i repot | — |

Det farligaste enskilda fyndet: `content-generation/generate.ts:150-180` bygger en
komplett LLM-prompt, **kastar den**, returnerar en hårdkodad svensk sträng, och sparar
prompten till DB som `prompt_rendered` — ett papperspår efter ett anrop som aldrig sker.
Samtidigt säljer `pricing/page.tsx` "AI marketing campaigns" som Pro-funktion. Det är
en truth-in-advertising-risk, inte bara teknisk skuld. Åtgärdas i WP-09.

`docs/audit-2026-07-09.md` §6 har redan ställt arkitekturdiagnosen och pekat ut
`TranslatorProvider` + `getTranslatorForPair()` som den enda rena sömmen och som mall.
**Vi bygger enligt den, inte om den.**

### Val av textleverantör

**Anthropic som primär, NVIDIA NIM som fallback.** Skäl:

1. **Prompt caching** är avgörande ekonomiskt. Redaktören ska ha hela manuset i kontext;
   utan caching betalar vi om för manuset vid varje fråga.
2. **Structured output via tool use** matchar exakt den form Bilaga 1 §3.1.1 kräver
   (`originalText`, `suggested`, `rationale`, `position`, `status`) — validerat, inte
   JSON-parsning med förhoppning.
3. NIM-nyckeln finns redan (`NVIDIA_NIM_API_KEY`) och Llama-3.1-8B är redan wired —
   gratis degraderad väg när Anthropic tryter eller när uppgiften är billig.

Modellval: `claude-sonnet-5` för volym (per-kapitel-granskning), `claude-opus-5` för
tung redaktionell analys (helhetsbedömning av struktur/karaktärer).

---

## 3. Scope: vad som ryker ur september

`docs/roadmap.md` är oförenlig med 34 dagar. Följande **stängs av eller lämnas OFF**
och rörs inte förrän efter mässan:

**Ur september:** mobilapp (App Store-review hinner inte, och lanseringskriterierna
kräver den inte — responsiv web räcker), översättningar, marknadsföringsmotorn,
socials-OAuth (IG/TikTok/X — plattformsgranskning tar veckor), Verkli Coin, streaks,
affiliate-portal, print-on-demand, book clubs, polls, newsletters, donations,
author subscriptions, per-kapitel-prissättning, röstkloning, karaoke-timing,
synkroniserat läs-/lyssnarläge, Stripe Connect-utbetalningar.

**Kvar i september:** en bok (Johans), konto, köp, bibliotek, ljuduppspelning,
lyssningsposition, support, analytics, kvitto.

Detta är produktionsplanens egen princip §4: *"Stabilitet går före fler funktioner
inför september"* och §5.3, som uttryckligen säger att fullt självbetjänad publicering
och alla AI-funktioner i produktionskvalitet **inte ska blockera** soft launch.

### En motsägelse som måste beslutas

`lib/flags.ts:22` dokumenterar att `NEXT_PUBLIC_AUDIOBOOK_ENABLED` ska vara **OFF**
vid cohort-soft-launch. Men produktionsplanen §9 kräver att *"Johans ljudbok startar
och spelar stabilt"* som **Måste**-kriterium.

**Beslut: audiobook-flaggan PÅ vid launch, men bara Johans bok har genererat ljud.**
Generering är redan Pro-/betalgated (`generate/route.ts:241`), så att flaggan är på
öppnar inte en kostnadskran för alla. Uppdatera kommentaren i `flags.ts` så nästa
läsare inte tror motsatsen.

---

## 4. Lanseringskriterier → verklig kodstatus

Produktionsplan §9, med verdikt från kartläggningen. **Detta är arbetslistan.**

| # | Kriterium | Verdikt | Blockerare | WP |
|---|---|---|---|---|
| 1 | Riktigt köp start till slut | Byggt och gediget, **overifierat i prod** | Ingen prod finns | WP-01 |
| 2 | Betalning → orderstatus + bokåtkomst | **Fungerar.** Idempotens-buggen är fixad, verifierad i kod | — | — |
| 3 | Köpt titel i rätt bibliotek | **Delvis** — ingen "Köpt"-hylla, avpublicering gömmer betald bok | `library/page.tsx:92,131` | WP-01 |
| 4 | Ljudbok startar och spelar stabilt | **Trasigt i container** | ffmpeg saknas i worker-image | WP-02 |
| 5 | Mobilt kärnflöde | Okänt | Aldrig testat på enheter | WP-06 |
| 6 | Konto/inloggning | **Delvis — trasig köptratt** | `?next=` ignoreras vid inloggning | WP-01 |
| 7 | Inga blockerande fel | Okänt | — | WP-06 |
| 8 | Köp + lyssningsstart mätbart | **Lyssning helt omätt** | 0 audio-events i hela appen | WP-03 |
| 9 | Tydlig supportväg | **Finns inte alls** | Ingen support-route existerar | WP-04 |
| 10 | Ingen blockerande prestandafråga | Okänt | — | WP-06 |

Plus från checklistan §19: *"Lyssningsposition sparas"* — **finns inte.** Textposition
sparas i `readings`, ljudposition sparas ingenstans (0 träffar på `audio_position`
i hela repot). WP-03.

Och: **inget köpkvitto skickas.** Ingen av de sex webhook-hanterarna mailar köparen.
Enda transaktionsmail en läsare någonsin får är waitlist-bekräftelsen. WP-01.

### Rättelse: idempotens-buggen är fixad

Audit-rapporten §3 heter *"Confirmed bugs — ALL FIXED"* och koden matchar. Verifierat:
POD-hanteraren kastar nu istället för att returnera `false` (`handlers.ts:239-253`),
author-subscription likaså (`:392-404`), `checkout.session.async_payment_succeeded`
finns i switchen (`:640`), och `rollbackStripeEvent` (`:786-800`) raderar
`stripe_events`-raden vid exception så Stripes retry kör om. Betalvägen är den
mest gedigna delen av systemet: pris från `books.price_amount` (inget hårdkodat),
entitlements skrivs **endast** av en SECURITY DEFINER-RPC med `SELECT … FOR UPDATE`,
RLS har droppat både `entitlements_insert_own` och `orders_update_own` (tidigare
exploits), och `/purchase/success` har en oberoende andra bekräftelseväg som ger
åtkomst även med webhooken nere.

### Köptrattens tre verkliga läckor

1. **`?next=` ignoreras.** Bokssidan skickar oinloggade till
   `/reader/signin?next=/reader/books/<id>` (`books/[id]/page.tsx:475`), men
   signin-sidan läser aldrig parametern — den hårdredirectar per roll till
   `/reader/home` (`signin/page.tsx:72`). **Varje köpare som måste logga in först
   landar i flödet och måste hitta boken igen.** Enskilt största konverteringstappet.
2. **Ingen "Köpt"-hylla och ingen orderhistorik.** `library/page.tsx:78` slår ihop
   köpta böcker med bokmärken i "saved" — köparen kan inte se vad hon äger.
   `/reader/orders` läser bara `pod_orders` (tryckta ex). Den digitala
   `orders`-tabellen konsumeras **enbart** av författarens intäktsstatistik.
   Ihop med det saknade kvittomailet: **köparen har inget artefakt alls som visar
   vad hon betalat för.**
3. **Avpublicering gömmer betald bok.** `library/page.tsx:92` filtrerar på
   `status = "PUBLISHED"`; avpublicerar författaren försvinner köparens bok tyst.

### Två flaggor som kan sänka launchdagen

- **`NEXT_PUBLIC_DISCOVERY_ENABLED` OFF ⇒ 404 direkt efter köp.** Både
  `/purchase/success` och `/purchase/cancel` har "Explore more books" som CTA mot
  `/reader/discover`, som 404:ar när flaggan är av.
- **`demo_mode` gömmer varje köp-CTA.** `isDemoModeActive` ersätter hela
  bokdetaljsidan med pitch-heron (`books/[id]/page.tsx:822-843`). Om någon råkar ha
  `demo_mode` på sin profil på launchdagen kan hon inte köpa något.

Och: **`NEXT_PUBLIC_SITE_URL` måste vara satt i produktion, annars returnerar varje
POST 500** (`middleware.ts:68-75`) — checkout inkluderat. Samma fil har två
kill switches, `NEXT_PUBLIC_WAITLIST_ONLY` och `BETA_LOCK`, som skickar allt till
`/waitlist`. De tre variablerna är launchdagens farligaste konfiguration.

---

## 4b. Författarsidan: byggd, men till stor del oåtkomlig

Publiceringsflödet är **den mest kompletta delen av hela produkten** —
`api/books/[id]/publish/route.ts` (578 rader) har fem riktiga blockerande grindar
(titel, författarnamn, minst ett kapitel, kapitel med innehåll, omslag), korrekt
tvåtabellsövergång, och per-kapitel seriepublicering som faktiskt fungerar.
Oktobermilstolpen är alltså närmare än väntat.

Problemet är ett annat: **`TOOL_ORDER` (`bookEditor.shared.ts:245-252`) exponerar
bara 6 flikar.** Panelerna `pricing`, `market`, `trailer`, `statistics`, `import`,
`print`, `dashboard` och `ai` är byggda men nås **enbart genom att skriva
`?panel=…` för hand.** Ingen länk finns i nav eller stepper.

### Penningbuggen

**Prispanelen ligger utanför steppern.** Priset sätts via
`PATCH /api/books/[id]`, som fungerar — men panelen är inte ett steg i flödet.

**Rättelse: buggen var smalare än först formulerat, men verklig.**
`BookEditorPanelContent.tsx:234` renderar redan `PricingPanel` *inuti* publish-steget,
under `PublishPanel`. En författare på Publish såg alltså ett prisfält — men under
fold, utan att något steg pekade dit. Den ursprungliga formuleringen "möter aldrig
ett prisfält" var alltså inte literalt sann. Att inte upptäcka ett fält är ändå
tillräckligt för att publicera gratis av misstag, så åtgärden står.

För Johans bok spelar det mindre roll (priset kan sättas direkt), men för
oktoberbeviset är det en blockerare.

**Rättelse 2026-08-18:** fixen är *inte* en rad i `TOOL_ORDER`. Stepper har **tre
oberoende sources of truth**, och två av dem sväljer tillägget:

1. `TOOL_ORDER` i `bookEditor.shared.ts:245`
2. `NON_STEPPER_TOOLS` i `BookWorkflowHeader.tsx:13-22` — en hårdkodad set som
   **innehåller `"pricing"`** och filtrerar bort det ur steppern även när det
   ligger i `TOOL_ORDER`
3. `BOOK_WORKFLOW_TABS` i `AuthorSidebar.tsx:47-60` — en helt egen hårdkodad
   lista som inte härleds från `TOOL_ORDER` alls

Alla tre måste ändras. Att bara röra `TOOL_ORDER` ger en ändring som ser fixad ut
på branchen och fortfarande tappar intäkt i produktion.

**Exkluderingen var inte ett beslut.** Spårad till `ae9cc5e`, som skrev
`STEPPER_TOOLS = TOOL_ORDER.filter(...)` med kommentaren *"Only the 6 linear flow
steps appear in the stepper"*. Vid den tidpunkten låg `pricing` **redan** utanför
`TOOL_ORDER`, så filtret var ett defensivt no-op för just pricing — ingen har någonsin
bestämt att pris inte ska vara ett steg. `8616a5d` konverterade sedan mekaniskt
filtret till `NON_STEPPER_TOOLS`. Vi river alltså inte någons designbeslut.

**Följduppgift (eget paket):** den djupare fixen är att `api/books/[id]/publish/route.ts`
visar priset vid publicering, så att gratis blir ett *synligt val* istället för en
olycka. Routen har redan fem riktiga grindar — det är den naturliga platsen. Att
förlita sig på att författaren inte hoppar över ett steppersteg är svagare.

### Författarstatistiken — huvuddelen fixad, fyra defekter kvar

**Rättelse 2026-09-04.** RLS/admin-klient-halvan och `'paid'`/`'completed'`-splitten är
levererade i `9bc37f6` + `0026ba7`, och de hårdkodade nollorna på författarens hem är
borta (riktiga frågor i `page.tsx:183-233`). Se §0e. Planens *mekanism* var korrekt:
`analytics_events` har ingen författarscopad SELECT-policy, och det är därför
admin-klienten är bärande snarare än en optimering.

**Fyra defekter som fixen inte fångade** — alla verifierade 2026-09-04, alla kvar i platform:

| Defekt | Var | Vad en betaförfattare ser |
|---|---|---|
| `donations` filtreras på `recipient_id`, en kolumn som inte finns i någon migration och inte i `types.ts` | `api/author/stats/revenue/route.ts:56` | PostgREST 42703 vid varje anrop. Felet loggas men svaret returneras, så donationsintäkt är permanent 0. Fixen rörde exakt denna rad och behöll kolumnfiltret verbatim — en tyst icke-träff byttes mot ett tyst hårt fel. |
| `readings` selekteras på `created_at`; kolumnen heter `started_at` | `author/analytics/[metric]/page.tsx:138` | 400, felet kastas utan logg → 0 unika läsare och tom tabell, direkt under ett hemkort som visade ett korrekt *icke*-noll läsarantal och länkade hit |
| `json.publishedBooks` läses men returneras aldrig av endpointen | `components/author/stats/AuthorStatsDashboard.tsx:73` | "Publicerade böcker" är 0 för alla, för alltid — plus en onödig dubbel HTTP-rundtur till samma endpoint |
| Tomma `catch` och allt state gatat på `res.ok` | `AuthorStatsDashboard.tsx:75` | En 500 från någon stats-route renderas som en **fullt befolkad nolldashboard** utan felstate. Exakt den tysta-nolla-mekanism fixen tog bort ur routerna, kvar ett lager upp i UI:t. |

Nollor och fel får inte se identiska ut. Den oskiljaktigheten är vad som lät hela
felklassen leva i månader.

**Beslutat 2026-09-04:** donationer ska modelleras på riktigt — en recipient-kolumn plus
en writer som fyller den — inte tas bort ur UI:t. Det är ett funktionsbygge snarare än en
reparation, och ligger därför sist i `wp/15`.

### Tre saker till som är fasad

- **AI-knapparna i editorn är no-ops.** "Rewrite", "Improve pacing", "Expand"
  dispatchar ett `CustomEvent` som har **noll lyssnare** i hela kodbasen. AI-chattens
  backend är komplett men har **noll anropare**, och `?panel=ai` har ingen komponent.
  Bra nyhet för WP-08: skalen finns, det är inkoppling snarare än nybygge.
- **Röst- och tonväljaren är dekorativ.** Hårdkodat `["Ryan","Emma","Alex"]`,
  värdet skickas aldrig. Servern använder alltid `DEFAULT_VOICE_ID = "Ryan"` — som
  enligt AI-inventeringen är ett **Qwen-röstnamn** som 4xx:ar mot ElevenLabs.
  **Syskonbugg, ej åtgärdad:** `audiobook/preview/route.ts:105` har
  `voiceId: voiceId || "Rachel"`. "Rachel" *är* en riktig ElevenLabs-stockröst, så
  den 4xx:ar inte — den läser tyst upp förhandsvisningar i fel röst när konfig
  saknas. Värre felmod än en krasch, eftersom ingen märker det.
- **Social OAuth är komplett och helt oåtkomlig.** Riktig OAuth2+PKCE för IG/TikTok/X
  och en worker som postar på riktigt — men ingen "Connect"-knapp finns. Vad
  författaren får är `CampaignDetailView.tsx:637`: *"Copy everything, open
  {post.channel}, paste, hit publish."* Att skära marknadsföring ur september
  kostar oss därför ingenting.

### Ingen revisionshistorik — och mekanismen är inte den planen beskrev

`book_versions` är en rad **per språk**, inte per revision. Verifierat 2026-09-04, och
skarpare än så: `UNIQUE (book_id, language_code)`
(`20260203000000_book_versions.sql:23-32`) tillåter exakt en rad per språk per bok, och
tabellen är *förälder* till levande kapitel via `chapters.book_version_id NOT NULL`. Den
har noll innehållskolumner och ~10 skrivställen som alla skriver livscykel, aldrig
innehåll. Den kan alltså inte bära snapshots — inte som den är, och inte med en tillagd
kolumn heller, eftersom blockeraren är unique-constrainten som `translation-worker.ts:369`s
`.upsert()` använder som conflict target. **Kapitelsnapshots kräver en ny tabell.**

**Rättelse: autosave rör aldrig en API-route.** `TiptapEditor` debouncar 500 ms per
transaktion och `useChapterCrud.handleAutoSave` kör en rå PostgREST-`UPDATE chapters SET
content = …` direkt från browsern (`useChapterCrud.ts:67-70`). Ingen `.select()`, ingen
`updated_at`-jämförelse, inget `version_number`-predikat, ingen lokal draft, inget
`beforeunload`. Det finns alltså **ingen server-seam att hänga en snapshot på** — det
kräver en DB-trigger eller att skrivningen flyttas bakom en route.

Tre förlustvägar är nåbara **av en författare på en enhet, utan någon samtidighet**:

1. `pendingSavesRef` — mappen som lades till för att inte tappa tangenttryck under en
   pågående sparning — är nycklad på kapitel-id men dräneras bara för det kapitel som
   just sparar. En post för kapitel B, registrerad medan A sparade, överlever och spelas
   upp *efter* B:s nästa och nyare sparning: äldre text skriver över nyare
   (`useChapterCrud.ts:82-89`).
2. Varje unmount kastar tyst upp till 500 ms skrivande. `TiptapEditor`s cleanup rensar
   debouncen utan att flusha (`TiptapEditor.tsx:171-175`) och `selectChapter` flushar inte
   (`useChapterSelection.ts:36-41`). Koden vet om det — `SimplifiedEditView.tsx:143-148`
   dokumenterar problemet och lappar bara inline-AI-vägen.
3. En sparning som matchar noll rader (raden borttagen av en `overwrite_draft`-import,
   eller en RLS-miss) returnerar `error: null`, så `persisted.ok` är sant och UI:t säger
   **"Saved"**.

**Två halvfärdiga skydd finns redan live:** `chapters.version_number` med en fungerande
BEFORE UPDATE-triggerbump, och `deleted_at`. **Ingen av dem läses eller skrivs av någon
applikationskod** — kapitelladdaren selekterar inte ens `version_number`.

Skrivvolym: en full dokument-JSON per ≥500 ms skrivpaus. Realistiskt 5-20/min vid
skrivande, värsta fall ~2/s, ~25-30 KB per skrivning för ett 3000-ordskapitel.
**Snapshot per sparning är inte överkomligt** utan koalescering eller hash-dedupe.

Editorn är inte enda skrivaren. Import-workern hard-deletar varje kapitel i draft-versionen
i `overwrite_draft`-läge — bakom en varningsbanner, utan confirm och utan snapshot. En
snapshot-trigger på radnivå skulle därför avfyras hundratals gånger i ett enda importjobb,
vilket är precis den kostnad skrivvolymen ovan utesluter.

**Beslutat 2026-09-04 — best practice, inte kompromiss.** Kapitelborttagning är *redan*
skyddad av en explicit modal på båda ingångarna (`SimplifiedEditView.tsx:450`,
`ChapterRail.tsx:263`) med texten *"This cannot be undone."* Författaren är informerad och
samtycker; det är den etablerade grinden för en destruktiv handling. De **oskyddade**
förlusterna är de tysta: författaren gör inget destruktivt, blir inte tillfrågad, och får
höra att det gick bra. `wp/16` fixar därför de tre tysta vägarna i **ren applikationskod,
noll migrationer**, mot kolumner som redan finns — återställbart med en redeploy. Soft
delete och snapshottabellen flyttas till `wp/16b` efter launch, med en live-probe av
`pg_constraint` först. Läs fällan i §0e innan den koden skrivs.

## 5. Arbetspaket

Partitionerade per katalog så att flera Claude-terminaler kan köra samtidigt utan
att krocka. **Filägandet i tabellen är exklusivt** — rör inte filer som tillhör ett
annat WP; behövs det, säg till istället för att editera.

### Wave 0 — Fundament (sekventiellt, dag 1–2, inga parallella agenter)

| ID | Uppgift | Ägare |
|---|---|---|
| W0.1 | Access-revoke + nyckelrotation i alla 10 tjänster. Radera `.env.local.bak`, `.env.local.bak.1781007122` efter rotation. | Svea (manuellt) |
| W0.2 | **Driftsätt plattformen.** Vercel för web (`vercel.json` finns), separat host för de 7 workers. Fixa `docker-compose.workers.yml` `env_file` → `apps/web/.env.local`. Lägg `apk add ffmpeg` i `Dockerfile.worker.audiobook`. Lös `vercel.json` `build` vs `build:ci`-motsägelsen (`docs/ci-build.md` säger webpack krävs). | Svea + agent |
| W0.3 | En kanonisk env-manifest. `apps/web/.env.production.example` saknar `HF_CREDENTIALS`, `NVIDIA_*`, `SENTRY_*`, `POSTHOG_*`, `OPS_HEALTH_TOKEN`, `OPUSMT_*`. | agent |
| W0.4 | **Kontraktscommit** — endast typer, noll beteendeändring: `TextProvider`-interface enligt `TranslatorProvider`-mall, centralt `ai_jobs.kind`-register (idag omdeklarerat på ≥3 ställen, `text_to_video` vs `text-to-video`), enat jobbkontrakt. Detta låser upp Wave 1+2 för parallell körning. | agent |

`git rm --cached supabase/.temp/*` ingår i W0.3 — den läcker prod-projektref och
skräpar `git status` varje gång.

### Wave 1 — Lanseringsblockerare (parallellt, dag 3–17)

| ID | Mål | Äger filer | Klar när |
|---|---|---|---|
| **WP-01** | Köptratten tätad + kvitto + ägandebevis | `api/stripe/**`, `lib/payments/**`, `api/books/[id]/purchase/**`, `lib/emails/**`, `(auth)/reader/signin/**`, `reader/library/**`, `reader/orders/**` | Riktigt Stripe-testköp i **driftsatt** miljö → bok i bibliotek → kvittomail. `?next=` respekteras vid inloggning. "Köpt"-hylla + digital orderhistorik. Avpublicerad bok försvinner inte för den som betalat. `checkout.session.async_payment_failed` och `.expired` hanteras (annars ligger ordrar `pending` för evigt). Pinna Stripe `apiVersion`. |
| **WP-05** | Launchkonfiguration låst | `lib/flags.ts`, `middleware.ts`, env-manifest | Explicit flaggmatris för launchbygget, verifierad i den driftsatta miljön: `SITE_URL` satt, `WAITLIST_ONLY`/`BETA_LOCK` av, `DISCOVERY_ENABLED` på, `DEMO_FACADE` av, `AUDIOBOOK_ENABLED` på. Ingen testanvändare har `demo_mode`. Rätta den felaktiga kommentaren på `flags.ts:22`. |
| **WP-02** | Ljudleverans korrekt | `scripts/audiobook-worker.ts`, `api/books/[id]/audiobook/**`, `lib/tts/**`, `Dockerfile.worker.audiobook` | ffmpeg i image; `play/route.ts:159` filtrerar på språk+voice+model, inte bara `chapter_id`; kapitel-scope uppdaterar `books.audiobook_status`; `PIPELINE_SMOKE_MODE`-ljud märks i DB; unik-constraint på `audiobook_assets(book_id, language)`. |
| **WP-03** | Lyssning mäts och sparas | `ReadingProgress.tsx`, `ChapterAudiobookPlayer.tsx`, `lib/analytics/**`, ny migration | `listen_start` + `listen_progress` events; ljudposition persisteras och återupptas; `analytics_events` RLS-frågan löst (`book_view` och `start_reading` skrivs idag med session-client mot en service-role-only-tabell — verifiera att de inte tappas tyst). |
| **WP-04** | Supportväg | `(public-reader)/support/**`, `Footer.tsx`, `ReaderAppShell.tsx`, `admin/feedback/**` | `/support` finns, nås från inloggad läsarshell (footern renderas **inte** i någon inloggad reader-layout idag), formulär → `feedback`-tabellen, admin-UI läser den (`api/admin/feedback` finns men har noll konsumenter). Ersätt de 5 "contact support"-strängarna som saknar adress. |
| **WP-06** | Johans bok + enhetsmatris | `public/demo-assets/**`, seed-scripts, QA | Riktigt ljud genererat (inte smoke-silence), komplett produktsida, verifierad på iOS Safari + Android Chrome + desktop. |
| **WP-14** | Författarsidans penningbugg + ärlighet | `bookEditor.shared.ts`, `AudiobookPanel.tsx`, `views/BookDashboard.tsx`, `BookEditorPanelContent.tsx` | `pricing` ligger i `TOOL_ORDER` så ingen publicerar gratis av misstag. `DEFAULT_VOICE_ID = "Ryan"` ersatt (Qwen-namn som 4xx:ar mot ElevenLabs). Röst-/tonväljaren skickar sitt värde eller tas bort — inte dekorativ. Buggarna `panel: "audio"` → `"audiobook"` och `bookDescription=""` fixade. |

### Wave 2 — AI-substrat + mässdemo (dag 10–24, överlappar Wave 1)

| ID | Mål | Äger filer | Klar när |
|---|---|---|---|
| **WP-07** | Anthropic-adapter på substratet | `lib/ai/providers/text/**`, `lib/ai/prompts/**` | `TextProvider` med Anthropic primär + NIM fallback; versionerat promptregister med hash i `ai_jobs`; kostnad/körtid/modellversion loggat per anrop (Bilaga 1 §3.9-kravet). |
| **WP-08** | Redaktionell manusanalys | `lib/ai/editorial/**`, `api/books/[id]/ai/**`, editor-paneler | Kapitel in → strukturerade förslag ut i §3.1.1-form, accept/avslå per förslag. Detta är både beta-författarnas wow och mässdemon. |
| **WP-09** | Avfejka marknadsföringstexten | `lib/ai/content-generation/**`, `lib/marketing/**`, `pricing/page.tsx` | Antingen riktig LLM bakom alla 5 implementationer, eller ärlig ommärkning i UI + prissida. Inget mellanläge. |
| **WP-10** | Publishern | `lib/ai/assistants/**` | Plattformsassistent med RAG över egna docs. Billig, hög demovärde på mässan. |
| **WP-15** | Författarstatistiken visar riktiga tal | `api/author/stats/**`, `api/books/[id]/stats/**`, `author/home/**`, ny RLS-migration | Stats-routerna använder admin-klienten (som publiceringsroutern redan gör), **KLART 2026-08-31** i `9bc37f6`+`0026ba7`; det påstådda filterfyndet var refuterat, se §0e. Kvar: fyra defekter i §4b — `donations.recipient_id` och `readings.created_at` (kolumner som inte finns), `publishedBooks` som aldrig returneras, och en dashboard som renderar nollor istället för felstate. `'paid'` vs `'completed'` enat. Hårdkodade `sales: 0` / `comments: 0` beräknade. Tomma `catch {}` ersatta så framtida fel syns. Betaförfattarna börjar nu — de får inte mötas av nollor. |
| **WP-16** | Autosave tappar inga tecken | `hooks/useChapterCrud.ts`, `TiptapEditor.tsx`, `useChapterSelection.ts` | **Omskrivet 2026-09-04, noll migrationer.** De tre tysta förlustvägarna stängda: stale replay kan inte skriva över nyare text, unmount/kapitelbyte flushar debouncen, och en nollrads-UPDATE blir ett synligt fel istället för "Saved". Se §4b för mekanismen. |
| **WP-16b** | Kapitelsnapshots + soft delete | ny tabell, ny migration | **SKJUTS TILL EFTER 20 SEP.** Kräver ny tabell (`book_versions` kan inte bära det), en AFTER UPDATE-trigger med koalescering, en retentionpolicy och ett restore-UI. Enda paketet som rör ett driftat live-schema. Fällan i §0e måste läsas först. |

### Wave 3 — Oktoberbeviset (efter mässan)

WP-11 extern författare hela vägen till publicerad titel · WP-12 Redaktören
(manus-RAG med prompt caching) · WP-13 översättning omarkitekterad till LLM-pipeline
(ersätter lokal Marian-modell och dess odokumenterade host-state).

---

## 6. Arbetssätt för parallella agenter

- `platform` är integrationsbranch. **En branch per WP: `wp/NN-slug`.**
  Att branchen finns = paketet är taget. Ingen board-fil, inga merge-konflikter om status.
- Använd git worktree vid parallell körning så agenter inte delar arbetskatalog.
- **Definition of done per WP:** acceptanskriteriet i tabellen uppfyllt
  **och** `npm run qa:beta` grön (7 steg: env → vitest → eslint → english-default →
  no-placeholders → dead-code → build) **och** en codex-reviewpass körd.
- Små PR:er, merge dagligen. `.husky/pre-commit` kör redan full lint+tsc+build+test,
  så en trasig commit hinner inte spridas.
- Rör aldrig ett annat WP:s filer.

---

## 7. Risker

| Risk | Allvar | Motåtgärd |
|---|---|---|
| **Prod-hosten är odokumenterad och oreproducerbar** | Mycket hög | W0.2. Ingen provider, host, OS, proxy, TLS eller process manager finns nedskrivet någonstans, och det finns ingen deploy-automation att reverse-engineera. Ingen Dockerfile för `apps/web`. |
| Flaggor är build-time | Hög | Alla flaggbeslut låsta före launch-bygget. Ingen flagga kan flippas i prod. |
| Båda CI-workflows är sannolikt trasiga | Hög | `ci.yml` kör `npm ci` i `apps/web` som saknar lockfile; `pipeline-smoke.yml` gatear på `secrets.*` i job-level `if`, vilket alltid utvärderas tomt → hoppas alltid över. Kontrollera Actions-historiken. |
| `vercel.json` bygger med Turbopack, docs kräver webpack | Medel | W0.2 |
| Stripe `apiVersion` opinnad i prod-kod | Medel | WP-01 |
| Lokal OpusMT-modell = tribal knowledge | Låg i sept | Avvärjs av att översättning är ur scope. `scripts/setup-opus-models.sh` är återställningsvägen. |
| Zombie-ytor från raderad Qwen3-stack | Låg | `/api/tts` 410-stub, `tts_preview_jobs`-tabell utan worker, `DEFAULT_VOICE_ID = "Ryan"` (ett Qwen-röstnamn som skickas till ElevenLabs och 4xx:ar). Städa i WP-02. |
| **Betaförfattare kan förlora arbete** | Hög | Autosave skriver över på plats, ingen revisionshistorik. Betan startar nu. WP-16. |
| **Ops kan inte agera på launchdagen** | Hög | `/admin/queues` är **read-only** — ingen retry, requeue, drain eller pause, så ett fastnat jobb kan inte åtgärdas från UI:t. Och `/admin/books` kan **radera** en bok men inte avpublicera eller stänga av den. Lägg till minst retry + avpublicera före den 20:e. |
| ~~Latent läcka mellan författare~~ | — | **Refuterat 2026-09-04**, se §0e. Ersatt av en verklig men mindre risk: `api/books/[id]/stats/route.ts` scopar ~8 service-role-läsningar på en path-param som anroparen styr, utan databasbackstop under JS-jämförelsen i `getBookAsOwner`. |
| **Köp-POST dör när ett lås slås på** | Hög | Ingen middleware-allowlist innehåller `/order` eller `/api/order`. Låsen är av i prod idag (probe 2026-09-04), men `BETA_LOCK` är precis den flagga som slås på för betakohorten. `wp/17`, se §0e. |
| **Sväljta fel når ingen** | Hög | Sentry stänger av sig själv utan `SENTRY_DSN`, som inte finns i launch-matrisen, och `check:launch-config` är inget steg i `qa:beta`. ~10 fynd i denna plan är tysta fel som ingenting hade rapporterat. Se §0e. |

---

## 8. Beslut som behövs av Svea denna vecka

### ✅ Beslutat 2026-09-04

| Fråga | Beslut |
|---|---|
| **Donationsintäkt** — `donations.recipient_id` finns inte, och donationer är inte modellerade per mottagare (enda writern sparar *betalarens* `user_id`). Ta bort tile:n, eller modellera? | **Modellera på riktigt.** Recipient-kolumn plus en writer som fyller den. Funktionsbygge, ligger sist i `wp/15` — descopa där om kalendern kniper. |
| **Mobilfixarna** — 16 engångslappar på klasstängar, eller adoptera DESIGN.md:s `.input-base`/`.btn-primary` som de trasiga elementen kringgår? | **Adoptera utilities.** Fixa den delade `Input`-primitiven först, konvertera sedan de felande läsarelementen till de sanktionerade klasserna. 16 lappar är 16 nya platser för samma regression. |
| **WP-16:s omfång** — soft delete kräver att den ovillkorliga `UNIQUE (book_version_id, "order")` byts mot ett partiellt index, dvs. en migration mot ett driftat schema 16 dagar före launch. | **Ren applikationskod, noll migrationer.** Kapitelborttagning är redan skyddad av en explicit "This cannot be undone"-modal på båda ingångarna; de oskyddade förlusterna är de *tysta*. Soft delete + snapshots → `wp/16b` efter launch. Motivering i §4b. |

### 🔴 Nya blockerande frågor från granskningen (§0e)

1. **Vilken ansökningsväg fick den nuvarande betakohorten?** `beta_applications` finns
   live men all dess kod ligger bara på `feat/beta-apply`, och `/apply` 404:ar på
   platform. Platform har sitt eget `api/author-applications` som kräver
   admingodkännande. Dränerar någon pending-kön?
2. **Slås `BETA_LOCK` på för kohorten under onboarding?** Om ja är andra halvan av
   `wp/17` obligatorisk **innan nästa författare bjuds in**, inte bara före launch.
3. **`SENTRY_DSN` i produktion — satt eller inte?** Om inte är varje sväljt fel i denna
   plan osynligt. Lägg in den i `launch-config.ts` och gör `check:launch-config` till ett
   `qa:beta`-steg oavsett svar.
4. **Är `/order` och `/waitlist` medvetet svenska?** De ligger utanför
   `check-english-default`s `SCOPE` av konstruktion. Skriv in undantaget eller lägg in
   katalogerna.

### Kvarstående från tidigare

Produktionsplanen §21 ställer tio frågor. Dessa fyra är tekniskt blockerande:

1. **Var driftsätts workers?** (Railway, Fly, Hetzner, eller Vercel-cron-omskrivning)
2. **Audiobook-flaggan PÅ i september** — bekräfta §3-beslutet.
3. **Anthropic som primär LLM** — bekräfta, så WP-07 kan börja.
4. **Vilken enhetsmatris är officiell** för §9-kriterium 5?
5. **Vilka betalmetoder?** Checkouten är **kortbetalning enbart** idag
   (`stripe.ts:106`, `payment_method_types[0]=card`) — ingen Swish, Klarna, Apple Pay
   eller Google Pay. För en svensk soft launch är det ett aktivt val, inte en
   förbiseelse. Motsvarar produktionsplanens §21 fråga 5.
6. **Test- eller live-nyckel?** Det finns **ingen mode-guard** någonstans —
   `grep sk_test|sk_live|livemode` träffar bara testfiler. Inget hindrar en
   testnyckel i prod eller en livenyckel i staging, och webhooken gör ingen
   `livemode`-kontroll. Bestäm och lägg in en assertion.
7. **De åtta föräldralösa panelerna: exponera eller radera?** `pricing`, `market`,
   `trailer`, `statistics`, `import`, `print`, `dashboard` och `ai` är byggda men
   ligger utanför `TOOL_ORDER`. `pricing` måste in (WP-14). För de övriga är
   valet antingen att lägga dem i steppern eller att radera dem — att låta byggd
   kod ligga oåtkomlig är den värsta av de tre. Samma fråga gäller
   `/author/stats`, `/author/inbox`, `/author/notifications` och `/author/voices`,
   som renderar riktiga sidor med **noll inlänkar**.
