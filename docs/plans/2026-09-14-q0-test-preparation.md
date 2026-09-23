# Q0 — testförberedelse för inbjuden beta

14 september 2026. Status: **read-only inventering klar; testerna nedan är förberedda, inte körda av Q0**. Endast detta dokument skrevs. Inga fixtures, jobb, provideranrop, kontoskrivningar, köp eller deployer utfördes. Root lästes på HEAD `e49d3c40f3564b4a567d0218be051dded8a183bf`; dess ocommittade leverans och aktiva preview lämnades orörda. R0 äger sin kandidat separat.

**Uppdaterat samordningsläge:** förberedelsen är levererad. Miljön för senare autentiserade kundresor, separat konto B/läsare och faktisk leveransinbox är ännu inte slutligt fastställda; befintligt konto A och dess tillåtna flöde är inventerade. R0:s isolerade offentliga gate är nu **VERIFIERAD LOKALT**, med preview på port **3031**; ingen commit/push/deploy, och livebaseline är fortsatt `26d02239`. Kommandona nedan är återanvändbara instruktioner med standardport 3022; starta inte en konkurrerande process till den befintliga previewn.

R0:s [oberoende verifiering](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-verification.md) redovisar 1 817 baseline-unitpass och 1 834 efter mejlretry-fixen. Baseline launch-E2E gav 8/10 och visade två hydrationgates; SSR-fixen är fryst i träd `20d73d3665021c84fe88f8946f1c2a57ab65a043`. Slutkandidaten har **PASS på lint/TypeScript, 176 filer / 1 840 unit, normalt Turbopack-produktionsbygge, 10/10 oförändrade launch-E2E utan skips/retries/timeoutändringar och 3/3 browserprov utan JavaScript**. Sista provet slutade 15:49:48 UTC med oförändrat källträd. [Källgranskningen](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-review.md) stänger mejl-P1 och hittar ingen ny P0/P1 i SSR-fixen; ärvd rate-limit-P2 har annan ägare. Dessa bevis kommer från R0, inte Q0. De utgör inte inbox- eller kundreseverifiering.

[AI-handoffen](2026-09-14-ai-integration-handoff.md) är klar: AI-01 är två avgränsade filer efter verifierad R0, medan AI-02:s måltextöverskrivning är en separat P0 för ersättningsflödet. Externa Claude-, Cursor- och Grok-uppdrag har inte startats.

## Slutsats och källor

R0:s offentliga produktionskontroll behöver varken konto, beta-grant eller betalda tjänster. Ett befintligt E2E-konto och en privat testbok kan återanvändas för vanlig inloggning och avgränsad workspace-QA. Dagens positiva test på 3050 bevisar däremot inte att kontot passerar R0 med `BETA_LOCK=true`; den frågan ska observeras vid vanlig inloggning, inte lösas genom att ändra kontots behörigheter.

Källorna nedan är relativa till `/Users/admin/verkli-web`, utom de två första som ligger i planeringsworktreets `docs/plans/`:

| Källa | Varför den styr Q0 |
|---|---|
| `2026-09-14-launch-command-plan.md`, `2026-09-14-launch-task-pack.md` | Omfattning, filägarskap, kostnadsgrindar och krav på samma kandidat-SHA. |
| `apps/web/playwright.launch.config.ts:6`, `apps/web/e2e/launch-readiness.spec.ts:7` | Explicit offentlig svit, redan startad server, inga köp/signup/mejl; osignerad webhook och ogiltig feedback. |
| `apps/web/playwright.config.ts:7` | Generell svit laddar lokal env, startar/återanvänder **dev** på 3000 och tar med autentiserad AI-svit. |
| `apps/web/playwright.details.config.ts:7` | Kontrollerad UI-svit mot redan startad preview; authed-projekten utelämnas helt när E2E-credentials saknas. |
| `apps/web/e2e/ai-features.authed.spec.ts:47` | Ett riktigt LLM-anrop körs utan opt-in; omslagsprovet vid rad 88 har däremot `E2E_RUN_PAID`-spärr. |
| `apps/web/e2e/auth.setup.ts:18`, `apps/web/scripts/e2e-fixture.ts:130` | Vanlig inloggning kan användas separat. Fixturekommandot återställer befintligt lösenord och upsertar profil/billing; det är inte en läskontroll. |
| `docs/plans/2026-09-14-editorial-campaign-payout-delivery.md:40` | Dagens verkliga login, granskningsanrop, CAS-sparning och ångra; original återställt enligt leveransen. |
| `docs/plans/2026-09-10-launch-readiness-qa.md:39` | Produktionsbygge krävs för middleware; historiskt nekad grant avsåg just den behörighetsändringen. |
| `.github/workflows/ci.yml:32`, `apps/web/vitest.config.mts:5`, `apps/web/scripts/qa-beta.mjs:214` | CI:s Node 22/typkontroll/build/unit; unit exkluderar E2E; `qa:beta` blandar lokala och externa kontroller och kan hoppa över steg. |

## Namngiven miljö och befintlig autentisering

| Del | Observerat, utan hemligheter |
|---|---|
| E1/X1-preview | `http://127.0.0.1:3050`; aktiv lyssnare PID 926, cwd `/Users/admin/verkli-web/apps/web`. Q0 gjorde inga HTTP-anrop och ändrade inte processen. |
| Aktiv lokal konfigurationsfil | `/Users/admin/verkli-web/apps/web/.env.local`; **produktions-Supabase**, inte staging. `NEXT_PUBLIC_SUPABASE_URL` och `SUPABASE_URL` pekar båda på `glfipbnsyxowqsmcuzcm.supabase.co`. Root `.env.local` pekar också dit. |
| Kö | Lokal konfig anger `localhost:6379`, Redis DB 0. Inga anslutningar gjordes. Detta bevisar inte produktionsköns mål eller aktuella consumers. Namn i `apps/web/src/lib/queue-names.ts`: `book-import-extract`, `book-translation`, `audiobook-generation`, `marketing-campaign`, `social-publish`, `recommendations`, `notifications`. |
| Storage | Samma Supabase-projekt. Kodens buckets: `book-imports`, `book_covers`, standard `audiobooks` (ingen lokal bucketoverride), samt `book-downloads` för fristående köp. Ingen färsk bucket-/RLS-probe gjordes. |
| Stripe/provider | Lokal Stripe-nyckel är **testläge**. Anthropic, NVIDIA NIM, fal, ElevenLabs och Resend är konfigurerade. Testläge för Stripe isolerar inte Supabase och gör inte AI-anrop gratis. Inga nyckelvärden lästes ut. |
| Testkonto A | `E2E_AUTHOR_EMAIL` och `E2E_AUTHOR_PASSWORD` finns i appens `.env.local`; de saknas i Q0:s ärvda shellmiljö. Kontots faktiska e-post/lösenord ska inte kopieras till rapport eller kommandorad. |
| Befintlig bok | Identifieras under inloggad ägare via slug `e2e-fixture-automated-test-book`, titel `E2E fixture — automated test book`, kapitel `E2E fixture chapter`. Fixturedefinitionen anger draft/private. UUID och aktuell visibility ska läsas i nästa tillåtna autentiserade kontroll; Q0 gjorde ingen DB-läsning och hittade ingen registrerad UUID i leveransrapporten. |
| Sparad authfil | `/Users/admin/verkli-web/apps/web/e2e/.auth/author.json` finns, senast ändrad 28 augusti. Två cookies för `localhost`, inte `127.0.0.1`; cookie-TTL är inte bevis för giltig Supabase-session. Färsk vanlig inloggning på vald origin rekommenderas. Ingen cookie/token skrevs ut. |
| Flaggor | Appens env har `NEXT_PUBLIC_DEMO_FACADE_ENABLED=true`, audio/marketing aktiverat; `BETA_LOCK` och `NEXT_PUBLIC_WAITLIST_ONLY` är inte satta i filen. Processens runtime-overrides är inte inventerade. Återanvänd inte hela filen som R0:s releasekonfiguration. |
| Produktion, separat föräldraobservation | Releaseägaren rapporterade samma dag en read-only whitelistkontroll via Railway: `BETA_LOCK=true`, `NEXT_PUBLIC_WAITLIST_ONLY=false`, ingen demo-fasadflagga, site `https://www.verkli.com`, Stripe **live**, webhookhemlighet och Resend key/from konfigurerade. Q0 har inte själv upprepat kontrollen. Lokal Stripe testkonfig får alltså inte märkas som produktionsbetalningsbevis. |
| Konto B/läsare/inbox | Ingen separat namngiven godkänd författare B, läsaridentitet eller leveransinbox är belagd av denna inventering. Tvåkontoisolering och faktisk mejlleverans återstår. Avsaknad av detta blockerar inte R0:s offentliga eller hermetiska kontroller. |

Det exakta tidigare flödet finns även i `/tmp/verkli-editorial-ui/app-qa.cjs`: rad 5 slår upp **egen** fixture via slug, rad 9 öppnar review på 3050, rad 10 gör riktigt AI-anrop, rad 13 ger en märkt syntetisk rättning, rad 15–18 sparar och ångrar via UI/Supabase, rad 21 har villkorad återställning. **Kör inte filen som read-only smoke:** den gör provideranrop och kapitelskrivningar. Spara/ångra och dagens AI-bevis rapporteras separat från en framtida kandidatverifiering. Kostnad och antal provideranrop från den tidigare leveransen är ännu inte avstämda.

## Exakta kostnadsfria R0-kommandon

Körs av R0-ägaren i `/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914` efter att kandidaten och befintliga dependencies är klara. Node 22 finns på sökvägen nedan; datorns vanliga `node` väljer annars **20.19.4**. Bara ett buildjobb körs åt gången. Följande är en isolerad kontroll av produktionsartefaktens offentliga åtkomst, inte ett intyg om riktig auth/DB/betalningsintegration.

Produktionsgrinden är normal Turbopack via `npm run build -w @verkli/web`. Använd befintlig optional-dependency-förberedelse enligt `infra/docker/Dockerfile.web:57–82`; R0-verifieringen dokumenterar den reversibla lokala motsvarigheten och varför den behövdes. Inga package-/schemaändringar krävs av förberedelsen, och webpack ska inte ersätta produktionsgrinden. Varje ny kandidat behöver egna resultat.

Förutsättning: inga aktiva `.env`-filer i kandidatens `apps/web`; behåll eventuella filer och låt R0-ägaren välja isolerad miljö om kontrollen nedan stoppar. Ingen root-env kopieras. Syntetiska Stripevärden behövs eftersom webhookrutten annars returnerar 500 innan den kan neka saknad signatur (`apps/web/src/app/api/stripe/webhook/route.ts:25`).

```sh
cd /Users/admin/verkli-web/.claude/worktrees/release-integration-20260914
R0_QA_PATH=/Users/admin/.nvm/versions/node/v22.17.0/bin:/usr/bin:/bin:/usr/sbin:/sbin
r0clean() { env -i PATH="$R0_QA_PATH" "$@"; }
r0clean node -e 'const fs=require("node:fs"); const found=[".env.production.local",".env.local",".env.production",".env"].filter(n=>fs.existsSync("apps/web/"+n)); if(found.length){console.error("Stop: candidate app has env files: "+found.join(", "));process.exit(1)}'
r0clean node --version
git rev-parse HEAD
r0clean npm run lint -w @verkli/web
r0clean npx --no-install tsc --noEmit -p apps/web/tsconfig.json
r0clean npm test -w @verkli/web
r0clean npm run check:no-prisma

r0public() {
  r0clean env \
    BETA_LOCK=true NEXT_PUBLIC_WAITLIST_ONLY=false \
    NEXT_PUBLIC_DEMO_FACADE_ENABLED=false DEMO_FACADE_ENABLED=false \
    NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022 \
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=q0-placeholder-anon-key \
    STRIPE_SECRET_KEY=sk_test_q0_placeholder \
    STRIPE_WEBHOOK_SECRET=whsec_q0_placeholder \
    NEXT_TELEMETRY_DISABLED=1 "$@"
}
r0public npm run build -w @verkli/web
r0public npm run start -w @verkli/web -- --hostname 127.0.0.1 --port 3022
```

I en andra terminal, samma kandidat:

```sh
cd /Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/apps/web
env -i PATH=/Users/admin/.nvm/versions/node/v22.17.0/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  PLAYWRIGHT_CHANNEL=chrome LAUNCH_QA_URL=http://127.0.0.1:3022 \
  npx --no-install playwright test --config playwright.launch.config.ts
```

3022 är konfigurationens standard; kontrollera ledig port före start med `lsof -nP -iTCP:3022 -sTCP:LISTEN`. Om upptagen: använd en annan tilldelad port i **build, start och LAUNCH_QA_URL**, stoppa inte befintlig preview. Förväntat: tio public/negative-access-tester, inga skippade. Inga giltiga Stripehändelser skickas; tom feedback nekas före DB-insert och begränsas av lokal rate limiter utan Redis. Inga riktiga tjänstenycklar finns i kommandona. Körresultat måste registreras på R0:s faktiska SHA; detta dokument lovar inte att ännu okörda kommandon passerar.

## Sviter och nästa autentiserade pass

| Klass | Tillåten avgränsning / vad testet faktiskt bevisar |
|---|---|
| Hermetisk unit | `npm test -w @verkli/web` med ren shellmiljö. Vitest tar inte E2E. Granskade Anthropic/NIM-, Stripe-, TTS- och routeprov använder SDK-/fetch-/DB-mocks; `stripe-e2e-smoke.test.ts` är uttryckligen simulerad livscykel. |
| Offentligt prodbygge | `playwright.launch.config.ts` ovan. Ingen auth-setup och ingen auto-start av devserver. |
| Autentiserad UI utan generering | `playwright.details.config.ts` väljer `ui-details`, `author-control-details`, `import-campaign-details`, `command-palette`. Notifikationer/sparande/genereringsklick mockas eller aborteras där de används; GET-läsningar och vanlig login är verkliga. Översättnings-UI kan skippas vid avstängd feature och är då inte verifierad. |
| Generell E2E | **Kör inte som kostnadsfri launchgate.** `playwright.config.ts` har devserver 3000 och `ai-features.authed.spec.ts` gör riktig chatt även med `E2E_RUN_PAID=false`. Flera gamla specs förväntar signin där betan avsiktligt ger waitlist. |
| Providerprov | Chatt → Anthropic med möjlig NIM-fallback, omslag → fal, ljud → ElevenLabs; editorial/kampanj/översättning har egna anrop. Kräver tilldelat antal, retries, modell, maxkostnad och egna originalfixtures. Inget ljud genereras av nuvarande AI-E2E trots filens äldre kommentar om att kökedjan skulle bevisas där. |
| Drift-/billingläsning | `check:billing-catalog -- --strict`, `check:stripe-webhook -- --strict`, `check:queue-consumers -- --strict`, `check:rls-paywall -- --strict` körs separat i verifierad målmiljö. De går mot DB/Stripe/Redis och hör inte till isolerade kommandona ovan. `qa:beta` är inte full acceptans: vissa externa steg kan skippa; webhookcheckens testläge kan dessutom ge exit 0 med `Nothing compared`. |
| Stripeköp och inbox | Unitmocks eller lokal `sk_test` är inte bevis för checkout → entitlement → fil → mottaget mejl/refund. Namngivet testköp, testbok och inbox saknas för nästa fulla pass. |

För återanvändning av konto A: läs **endast** `E2E_AUTHOR_EMAIL` och `E2E_AUTHOR_PASSWORD` från den befintliga lokala filen direkt in i testprocessen utan utskrift. Kör kandidatens vanliga `auth.setup.ts` mot vald origin; den kräver att `/api/author/stats` verkligen ger 200 innan authfil sparas. Ingen fixture-bootstrap, reset, profilupsert eller beta-grant. Om R0 med rätt betaflaggor nekar kontot, dokumentera den faktiska redirecten/API-statusen och fortsätt övrig QA; dagens 3050-flöde kan fortfarande användas för diagnostik men räknas inte som R0-bevis.

Efter att R0-ägaren tillfört endast befintliga credentials till testprocessen och konfigurerat kandidatservern för avsedd authmiljö är det avgränsade kommandot från kandidatens `apps/web`:

```sh
UI_DETAILS_PREVIEW_URL=http://127.0.0.1:3022 PLAYWRIGHT_CHANNEL=chrome E2E_RUN_PAID=false \
  npx --no-install playwright test --config playwright.details.config.ts --project=authed
```

Observera att den syntetiska serverkonfigurationen i föregående avsnitt avsiktligt saknar verklig auth och därför inte kan användas för detta steg. Blanda inte dess testresultat med resultat från en ombyggd kandidat med verklig Supabase-konfiguration. Authed-kommandot är för nästa avgränsade QA-pass, inte något Q0 körde.

**Minsta föreslagna fix, ej implementerad:** lägg samma `test.skip(!RUN_PAID, ...)` som omslagsprovet använder allra först i `answers a question with a real model reply` (`apps/web/e2e/ai-features.authed.spec.ts:47`), före boknavigering och POST. Rätta filens kommentar så alla verkliga providerprov är opt-in. Ingen dependency eller produktionskod behöver ändras. Därefter kontrollera testlistan/skip utan credentials/provideranrop och håll explicit kostnadsfria projekt åtskilda från provideracceptans.

## QA-script och kvarvarande uppgifter

1. Registrera kandidat-SHA, Node 22, lokal port och miljöklass; kör lint, TypeScript, unit och produktionsbygge på samma kandidat.
2. Kör tio launch-tester; kontrollera 400 på osignerad webhook/tom feedback, 401 på workerhälsa, fungerande public/support/legal och spärrade privata sidor.
3. Logga in normalt med befintligt konto A på avsedd kandidat-origin; dokumentera faktisk betagrind och `/api/author/stats`, utan att ändra access.
4. Öppna endast konto A:s namngivna privata fixture, kontrollera editor/reload och 390/1440 px. Sparprov/providerprov sker först inom ett separat tilldelat testpass; dagens tidigare CAS/undo är historiskt bevis.
5. När konto B och läsare är namngivna: separata browser contexts, registrera fixture-ID:n och prova korsvis GET/manipulerade ID:n; muterande isoleringsprov kräver uttryckligt avgränsade testresurser.
6. Registrera varje utfall separat: UI, persistence, provider, kundresa, drift/live; ange skippat/ej kört, faktisk anropskostnad och nästa ägare. Testantal från root och R0 summeras inte.

**Exakt ny information som behövs inför senare steg:** befintlig godkänd författare B och läsaridentitet med tillåten säker inloggningsväg; namngiven inbox och testbok för testköp/återställningsmejl; samt faktiskt antal/kostnad för E1/X1:s tidigare providerprov. Dessa identiteter ska anges som kontoalias eller säker lokal credentialsreferens, inte lösenord i chatten. Om konto A nekas under R0:s betagrind behövs dessutom ett **redan inbjudet godkänt testkonto**, inte automatisk behörighetsändring av A. Inget av detta behövs för att starta R0:s kostnadsfria kontroller.
