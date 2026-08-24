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
filtrerad). WP-15 står kvar oförändrat.

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

### Författarstatistiken är strukturellt alltid noll

Inte fejkade siffror — tomma. Av två oberoende skäl:

1. **RLS har ingen författarscopad SELECT-policy** på `analytics_events` (endast
   INSERT-policy), `readings`, `orders` (`user_id` = *köparen*), `bookmarks` eller
   `donations` (`user_id` = *donatorn*) — och stats-routerna använder författarens
   session-klient istället för admin-klienten. Publiceringsroutern vet redan detta
   (`publish/route.ts:553`: *"analytics_events RLS blocks the author session"*), men
   stats-routerna fick aldrig samma behandling. Felen sväljs av tomma `catch {}`
   och renderas som ett vänligt "no activity yet".
2. **Statusvärdena är osynkade.** Finalize-RPC:n skriver `'paid'`, men båda
   intäktsfrågorna filtrerar på `'completed'` (`author/stats/revenue/route.ts:23,38`)
   medan `author/home/page.tsx:126` korrekt använder `'paid'`. Kodbasen är oenig
   med sig själv.

Plus hårdkodade nollor på författarens hem: `sales: 0`, `comments: 0` (`:59,62,135,138`).

> **Säkerhetsnot till den som fixar RLS:** `author/stats/books/route.ts:44-46`
> selektar `analytics_events` **helt utan författar- eller bokfilter**. Det är
> harmlöst idag enbart därför att RLS returnerar tomt — i samma ändring som lägger
> till en SELECT-policy blir det en läcka mellan författare. Fixa filtret först.

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

### Ingen revisionshistorik

`book_versions` är en rad **per språk**, inte per revision. Autosave skriver över
`chapters.content` på plats och enda ångra-funktionen är TipTaps sessionsstack.
**En betaförfattare som skriver över ett kapitel och laddar om har förlorat det.**
Det är en förtroenderisk i författarbetan som startar nu, inte i oktober.

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
| **WP-15** | Författarstatistiken visar riktiga tal | `api/author/stats/**`, `api/books/[id]/stats/**`, `author/home/**`, ny RLS-migration | Stats-routerna använder admin-klienten (som publiceringsroutern redan gör), **och** `author/stats/books/route.ts:44-46` får sitt saknade författar-/bokfilter i **samma** ändring. `'paid'` vs `'completed'` enat. Hårdkodade `sales: 0` / `comments: 0` beräknade. Tomma `catch {}` ersatta så framtida fel syns. Betaförfattarna börjar nu — de får inte mötas av nollor. |
| **WP-16** | Revisionsskydd i editorn | `hooks/useChapterCrud.ts`, ny migration | Snapshot vid autosave så en betaförfattare inte kan förlora ett kapitel genom att skriva över och ladda om. Minsta möjliga lösning, inte full versionshistorik. |

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
| Latent läcka mellan författare | Medel | `author/stats/books/route.ts:44-46` saknar författar-/bokfilter. Ofarligt bara så länge RLS är tomt. Måste fixas i samma ändring som WP-15. |

---

## 8. Beslut som behövs av Svea denna vecka

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
