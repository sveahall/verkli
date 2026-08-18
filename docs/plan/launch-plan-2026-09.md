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

**Prispanelen ligger utanför steppern.** En författare som följer
Write → Cover → Audio → Translate → Publish → Review **möter aldrig ett prisfält
och publicerar en gratis bok utan att bli varnad.** Priset sätts via
`PATCH /api/books/[id]`, som fungerar — men ytan är URL-only.

För Johans bok spelar det mindre roll (priset kan sättas direkt), men för
oktoberbeviset är det en blockerare, och fixen är att lägga `pricing` i `TOOL_ORDER`.

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
