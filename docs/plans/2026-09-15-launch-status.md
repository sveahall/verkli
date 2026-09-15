# Verkli — integrationsstatus och överlämning, 15 september

Ägare: Codex för integration och samtliga åtta S1-åtgärder. Claude/S1 granskar utan att skriva dessa fixar. Svea beslutar produktvillkor och databasändringar. Denna status ersätter de äldre statuskolumnerna i uppdragsregistret; ursprungliga briefar och avgränsningar gäller fortfarande.

## Så leds arbetet från och med nu

**Codex huvuduppdrag är samordnare och enda integrationsägare.** Codex väljer nästa paket, delegerar sina interna agenter, låser filägarskap, granskar deras resultat och testar den samlade kandidaten. Svea behöver inte välja agentroller, worktrees, Git-kommandon eller skicka samma uppdrag till flera verktyg.

- **Sveas nästa handling:** när Claude svarar på det redan skickade granskaruppdraget, lämna svaret eller rapportens sökväg i huvuduppdraget. Om rapporten sparas i repot kan Codex läsa den direkt. Produktvillkor, verklig kostnad och godkännandekrävande DB-ändringar lyfts som konkreta beslut med rekommendation.
- **Claude:** oberoende read-only granskning av S1-GATE, därefter S1-STORAGE och E1 enligt redan skickad brief. Utskicket är bekräftat av Svea; mottagarens faktiska arbetsstatus är inte verifierad av Codex. S1-DB är ett senare granskningspaket, ännu inte skickat till Claude.
- **Codex-agenter i aktuell våg:** `rate_limit_integration_review` granskar befintlig Redis-/limiterfix och exakt fillista; `launch_fixes_integration_review` granskar build/språkgrind/launch-alias och adminens betaindikator. Båda read-only-uppdragen är nu klara och har lämnat över; inga produktändringar gjordes. R1: inga P1/P2, avgränsat kärnpaket med 41 befintliga instanser i 43 filer inklusive helper/tester; 10/10 riktade tester. R2: en P2 i språkgrindens hela filundantag, övriga package/admin-hunks kan extraheras; 2/2 adminprov. Båda testades av agenterna med Node20, inte slutlig Node22-runtime. Huvuduppdraget har läst rapporterna och verifierat de 52 rapporterade källhashposterna.
- **Codex huvuduppdrag under vågen:** äger nästa implementation: extrahera R1:s avgränsade limiterpaket, package/admin-fixarna och begränsa språkundantaget före integration på R0. Editorial/marketing-hunkar och onboard-redirecten hålls till sina separata paket. De två granskaragenterna är avslutade; ingen bakgrundskodning påstås pågå efter deras överlämning. Inga nya uppdrag behöver öppnas i Cursor eller Grok för denna våg. Högst tre arbetande Codex-underagenter plus huvuduppdraget; en tung build åt gången.
- **Leveransgång:** avgränsad fix → regression/QA → oberoende review → en samlad kandidat → verklig författar-/läsarresa → release. En lokal agentrapport flyttar inte automatiskt något till live.

Rapporter och exakta fillistor: `/Users/admin/Documents/Verkli/Lansering-2026-09-15/Orkestrering/R1-rate-limit-review.{md,json}` och `R2-launch-fixes-review.{md,json}`. Dessa underlag används av Codex för nästa kodpaket; Svea behöver inte distribuera dem.

Korta användaruppdateringar ska säga **klart / pågår / nästa / behöver ditt beslut**. Tekniska loggar och filhashar finns kvar som underlag; de ska inte bli uppgifter som Svea behöver administrera. Codex driver det aktiva arbetet i detta uppdrag; ingen obeställd bakgrundsövervakning eller extern botstyrning är startad.

**Fyra paket är nu säkrade i Git:** F1, S1-GATE, S1-STORAGE och hela den lokala översättningskedjan. Översättningscommiten är en WIP-checkpoint med känd sparningsrisk. **R0 är redan pushad på sin granskningsgren. Ingen ny samlad kandidat är integrerad i `platform`, driftsatt eller verifierad genom hela kundresan.**

## 1. Verifierade referenser

Färsk fetch den 15 september bekräftar `origin/platform` vid `26d02239cf57cac050ada410e197692878145270`. Lokal `platform` ligger två commits bakom. Root ligger på `codex/launch-qa-20260910` vid `e49d3c40` med omfattande samtidiga ändringar; dess produktfiler/index har inte ändrats av detta koordinationsarbete. Dagens produktions-runtime-SHA är inte verifierad. Gitreferensen är inget bevis för vilken kod en liveprocess kör.

| Paket | Kandidat-SHA | Bas | Status |
|---|---|---|---|
| R0 | `e9544c19bbd23601070aa9bbbb67ce12b5169bd6` | `26d02239` | Ren, committad och pushad till `origin/codex/release-integration-20260914`. Starta inte R0 igen. |
| F1 | `3372782c2da4516ca80f40de7e6caeb60fddaf91` | R0 | Sju kandidatfiler committade. Två separata koordinationsdokument ligger kvar ostagade i worktreet; de ingår inte. Ej pushad/integrerad. |
| S1-GATE | `f9e53d8c3db4bfd15927f435c58fe618893ceb4f` | R0 | Sex kod-/testfiler och fyra bevis-/referensdokument, ren commit. Ej pushad/integrerad. |
| AI-kvalitetskedja | `74aa9075b8a59550be78173ee827b637d8a8896f` | `61c833da52948c253d5dc405832107152b222470` | 43 filer säkrade oförändrade, rent worktree. WIP; inte samma bas som R0 och inte releasegodkänd. |
| S1-STORAGE | `717a98eaedebddb6d70037263a339aab168d50a5` | R0 | Sex filer, ren commit. Separat kodförsvar för tre signerande routes. Databasdelen och behörig uppspelning återstår. |
| S1-DB | `bee4a27bf6554f14c423831bb5d4c956cb8ddb8d` | R0 | Sex förslags-/testfiler, rent worktree. 56/56 lokala PG14-kontroller; RED/rollback 22 pass/34 fail. Intern oberoende review utan P1/P2. Inte canonical migration, inte applicerad och ännu inte granskad av Claude. |
| E1/X1 samt fem rapporterade extra launchfixar | Ingen isolerad kandidat-SHA ännu | Dirty root | Ska attribueras och extraheras per hunk. Ingen masscommit eller massapplicering av rootdiffen. |

Arbetsytorna ligger under `/Users/admin/verkli-web/.claude/worktrees/`: `release-integration-20260914`, `f1-author-details-20260914`, `s1-release-gates-20260914`, `translation-quality-20260914` och `s1-storage-signing-20260915`. Planeringen ligger separat i `launch-command-20260914`.

## 2. Bevis och vad de faktiskt täcker

| Paket | Färska kontroller 15 september | Begränsning |
|---|---|---|
| F1 | Full lint, TypeScript utan inkrementell cache, 1 840 unit-tester och normalt Turbopack-produktionsbygge PASS. Källhashar oförändrade och exakt testat produktträd committat. | Browserprov finns från 14 september. Autentiserade E2E-filer är typkontrollerade, inte körda mot riktig kundresa. |
| S1-GATE | Full lint, TypeScript, 1 881 unit-tester och normalt Turbopack-produktionsbygge PASS. | Ingen livekörning av `qa:beta`. RED-bevis från 14 september: 29 fel/12 pass med gammal kod; slutlig riktad svit 41 pass. |
| S1-STORAGE | Full lint, TypeScript, 1 976 unit-tester och normalt Turbopack-produktionsbygge PASS; sex källhashar bevarade i commit. Riktad svit 143 pass; med R0-routes 84 fel/52 pass. | Ingen UI-/uppspelningsresa. Separat produktionsmetadata: alla 13 icke-tomma referenser matchar bokbundna format, noll okända format. |
| AI-checkpoint | Ordinarie Vitest-konfiguration: 12 filer/134 riktade tester PASS. Full ESLint, TypeScript, tio offlinefall och två inspelade granskaruppsättningar PASS. | Ingen ny full build/full unit eller verklig providerresa. Tidigare loggar är historiska. Full bokkvalitet är inte verifierad. |
| R0 | Git-SHA och ren arbetsyta verifierade idag. | QA från 14 september: 1 840 unit, lint/typer/build, launch-E2E 10/10, utan JS 3/3. Inget färskt live-/betalningsbevis. |

Testantal från separata kandidater ska inte summeras. Normala Git-commits användes utan hookbypass eller ändrad hookkonfiguration. De isolerade worktreesens konfigurerade `.husky/_/pre-commit`-wrapper saknas; därför kördes ingen hook. Explicit utförda kontroller ovan är bevisen. AI-checkpointen är avsiktligt WIP och får inte likställas med bygggodkänd release.

Bevis finns under `/Users/admin/Documents/Verkli/Lansering-2026-09-15/`:

- [F1: kandidatmanifest](</Users/admin/Documents/Verkli/Lansering-2026-09-15/F1-evidence/candidate-manifest.json>) och [filvis diff](</Users/admin/Documents/Verkli/Lansering-2026-09-15/F1-evidence/F1-andringar-per-fil.diff>).
- [S1-GATE: kandidatmanifest](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/candidate-manifest.json>), [sex kodfiler](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/S1-GATE-produktkod-per-fil.diff>) och [hela commiten](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/S1-GATE-andringar-per-fil.diff>).
- [AI: commit-/hashkontroll](</Users/admin/Documents/Verkli/Lansering-2026-09-15/translation-checkpoint/postcommit-verification.json>) och [filvis commitdiff](</Users/admin/Documents/Verkli/Lansering-2026-09-15/translation-checkpoint/committed.diff>). `REPORT.md` i samma katalog innehåller hela diffen och är mycket stor; börja med manifestet och enskilda filer under `diffs/`.
- [S1-STORAGE: manifest](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-STORAGE-evidence/candidate-sha256.json>), [filvis diff](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-STORAGE-evidence/candidate.diff>) och [integrationsgranskning](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-STORAGE-evidence/INTEGRATOR-REVIEW.md>).
- [Oberoende kontroll av de nya launchpåståendena](</Users/admin/Documents/Verkli/Lansering-2026-09-15/launch-claims-review.md>).

## 3. S1: färsk produktionsmetadata, inga åtgärder applicerade

Den befintliga länkade Supabase-CLI:n kunde köra det förberedda, skrivskyddade metadata-SELECT:et mot `glfipbnsyxowqsmcuzcm` den **15 september 08:02:33 svensk tid**. Ytterligare SELECT hämtade definitionen av profiltriggerns funktion. Inga användarrader/manustexter/filer hämtades, inget konto ändrades och ingen exploit utfördes. Ingen migration, GRANT, RLS-policy eller bucket ändrades.

Resultat och exakta kommandon: [production-inventory.json](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/production-inventory.json>), `readonly-inventory-cli.json`, `profile-trigger-definitions-command.json` och `profile-trigger-definitions.stdout` i samma katalog.

- `profiles` har effektiva tabellrättigheter INSERT/UPDATE/DELETE för `authenticated`, liksom skrivbara `role` och `demo_mode`. RLS tillåter ändring av egen rad utan kolumnbegränsning. Två profiltriggers finns, båda anropar samma funktion som **endast sätter `updated_at`**. De skyddar inte roller. Anon-grants är också breda, men det betyder inte att en anonym användare passerar de separata `auth.uid()`-villkoren.
- **Senare fynd den 15 september:** två andra triggers på `auth.users` anropar `handle_new_profile()`, som kopierar klientens metadata-roll och kan ge author via author/writer. S1-DB föreslår alltid reader vid registrering och ett uttryckligt admin-godkännande av nya författare. Befintlig beta-inbjudan ger endast beta-flaggan, inte author eller PRO. Befintliga roller ändras inte av förslaget. Read-only katalog 12:10:07Z visar PG17.6, inga ärvda klientroller/BYPASSRLS, breda grants inklusive MAINTAIN. Lokal PG14-provning ersätter inte PG17-/HTTP-/UI-/onboardingbevis.
- `ai_jobs_update_own` finns kvar. `audiobook_assets` har ägarbaserade INSERT/UPDATE-policyer utan skydd av lagringsreferenserna. Signeringsfixen är därför ett nödvändigt separat kodförsvar.
- `storage_audio_outputs_select_authenticated` tillåter autentiserad läsning av `audiobooks`/`tts-outputs`. `storage_content_assets_select_authenticated` är också bred. Ingen av dem är borttagen live.
- `chapter-media` är fortfarande publik och innehåller **noll objekt** enligt aggregeringen. Det stänger frågan om nuvarande innehåll, inte risken för framtida uppladdningar.

**Korrigering till rapportens föreslagna enradiga profilfix:** `REVOKE UPDATE (role, demo_mode)` ensam tar inte bort ett kvarvarande tabellomfattande UPDATE-grant. Hela den effektiva behörighetskedjan, inklusive INSERT och DELETE/återskapande, måste hanteras. En granskad konkret SQL-ändring och Sveas beslut krävs före applicering enligt projektets AGENTS.md. Metadataåtkomst finns nu; användaren behöver inte manuellt köra om triggerinventeringen.

| S1-blockerare | Aktuellt läge | Vad återstår |
|---|---|---|
| 00 — profilroller/demo | Livebrist bekräftad; S1-DB-förslag lokalt testat | Beslut/review av `bee4a27b`, onboardingkonsekvens, därefter godkänd applicering och verklig efterkontroll. |
| 01 — releasegrind | `f9e53d8c` redo för oberoende review | Granska RED/exit-1 samt undantag. Integrera och kör rätt konfigurerad grind på samlad kandidat. |
| 02 — lagringssignering | S1-STORAGE kodpaket; DB-bristen finns live | Review/integration, DB-skrivskydd och behörig uppspelning. Fast bucket utan bokbunden path räcker inte. |
| 03 — bred ljudläsning | Policyerna bekräftade live | Granskat SQL-förslag, beslut, applicering och återkontroll av alla tillåtande policyer samt riktig läsare. |
| 04 — återimport | Öppen | Framkallat fel med kapitelantal och originalinnehåll bevarade. Flyttad DELETE ensam räcker inte om upsert redan skriver över. |
| 05 — översättningsersättning | Kvalitetskedjan säkrad men WIP | Skydda befintlig/nyare måltext atomiskt. Kontroll före skrivning och hash efter skrivning löser inte racet. Verklig avbrottsreproduktion. |
| 06 — autosave | Öppen; F1-importfixen löser inte detta | Offline→online utan ny tangenttryckning, navigering/debounce, retry och textbevarande. Samordna med E1:s editorfiler. |
| 07 — ljudboksavbrott | Öppen | Köat och pågående jobb: återläs kontrolltillstånd och förhindra att checkpoint skriver över cancel. Redan påbörjat provideranrop kan inte garanteras kostnadsfritt i efterhand. |

Ingen av de åtta är markerad stängd i produktion.

## 4. De fem ytterligare launchfixarna

De rapporterade fixarna finns i root men inte i R0 eller `origin/platform`. Återanvänd dem efter isolering/review; skriv inte konkurrerande versioner.

1. **Build/språk/alias:** `apps/web/package.json` och `apps/web/scripts/check-english-default.ts`. R0:s vanliga build är Turbopack, men `build:ci` pinnar fortfarande webpack. Rotfixens undantag för hela `author-experience-data.ts` behöver granskas så framtida svensk UI-copy inte tyst undantas. `test:e2e:launch`-aliaset startar inte själv servern och gör inte sviten obligatorisk i CI.
2. **Rate-limit:** `apps/web/src/lib/rate-limit.ts`, dess tester och 43 befintliga routeanrop. Helperns nya obligatoriska `name` och samtliga anrop måste följa med som ett sammanhållet paket. Plocka bara limiterhunkarna ur delade routes.
3. **Adminstatus:** `apps/web/src/app/api/admin/users/route.ts` och `route.test.ts`. Grant ligger i `user_flags.beta_enabled`; gränssnittets gamla läsning av `profiles.preferences.beta_enabled` är fel. Övriga hunks i routen måste attribueras separat.

Rapporterade 1 883 root-tester är den andra granskarens historiska bevis, inte ett nytt pass på vår samlade kandidat. Claude skrev dessa fem rotfixar och ska därför inte ensam godkänna sin egen implementation.

## 5. Beslut och bevis som fortfarande behövs

- **Gratis PRO:** frågan är ställd till Svea och ännu obesvarad. Rekommendation: tidsbegränsat PRO för inbjudna med tydliga AI-kostnadstak. Alternativet är att ändra mejllöftet. Ingen av dessa ändringar är genomförd. Beta-flaggan ensam ger inte `billing_accounts.plan = pro`.
- **E-boksmejl:** R0 innehåller återförsöksfixen. HTTP 500 efter misslyckad mejlleverans är avsiktligt så att Stripe återförsöker. Påståendet att detta automatiskt stänger av hela Stripe-kontot/endpointen är inte verifierat. Testa faktisk leverans, återförsök och idempotens.
- **Återvändningslänken:** checkout-sessionens bärarlänk har ingen egen TTL/kontobindning; aktuell betalning omprövas vid ny nedladdning. Storage-URL:n gäller en timme. Det är en vidarebefordringsrisk, inte bevis för obegränsad åtkomst efter återbetalning. Bestäm önskad återhämtnings-/delningspolicy före en ny tokenmodell.
- **Köpsidans regression:** `success/page.tsx` skickar redan `expandPayment: true`; testet behöver falla om flaggan tas bort. Lägg även till retrybart felbesked och feature-prefixad logg utan session-ID/hemliga URL:er i stället för tysta catchar.
- **Tvister:** plattformen hanterar skapad tvist men saknar belagd återställning vid vunnen tvist. Lås tillstånd för öppen/vunnen/förlorad/återbetald och testa ordningen så en vunnen tvist inte återöppnar ett redan återbetalt köp.
- **Riktig kundresa:** konto B/läsare, leveransinbox och slutlig testmiljö är inte låsta. Ingen riktig betalning eller ny betald AI-körning gjordes i denna koordinationsrunda. 5 000 SEK är budgetplanering; en 75-kronorsorder är ännu inte godkänd eller utförd.

## 6. Nästa delegation — smala paket, högst fyra samtidigt

| Ägare | Nästa konkreta handling | Överlämning |
|---|---|---|
| Claude/S1, read-only | Granska **S1-01 vid `f9e53d8c`** mot rapportens kriterier. Därefter E1:s avgränsade diff. | Fynd med SHA, fil/rad, kommando/utfall och stängningsvillkor. Ingen produktkod eller SQL-applicering. |
| Codex integration | Storage är committad och lokalt kontrollerad; extrahera rootfixarna i tre paket ovan. | Filvis diff och separata SHA:er från R0. Ingen blind root-push. |
| Codex säkerhet/backend | Förbered konkret SQL för S1-00/02/03 från dagens liveinventering; därefter beslut/applicering/omtest. | Exakta grants/policyer, legitima flöden och återställningsplan. Ingen migration räknas som applicerad för att filen finns. |
| Codex AI/jobs | Åtgärda S1-04/05/07 med felreproduktion, bevara original och stoppa nya provideranrop vid cancel. | Små paket; översättningsworktreet är WIP-bas, inte releasebas. Autosave S1-06 samordnas med E1-ägaren. |

E1:s tilldelade filer: `BookEditorPanelContent.tsx`, `BookEditorView.tsx`, `hooks/useChapterCrud.ts`, `hooks/useChapterCrud.review.*`, `panels/EditorialReviewPanel.tsx`, `panels/ReviewPanel.tsx` under bokeditorn; `src/app/api/books/[id]/editorial/review/route.*` och `src/lib/editorial/*` under `apps/web`. Granska källversionskontroll, godkännande/ångra, ägarskap, begränsning av AI-instruktioner och felvägar. Delad aggregator innehåller också en X1-marketinghunk som inte ska smygas in i E1.

Underlag: rootrapporten `docs/plans/2026-09-14-editorial-campaign-payout-delivery.md` och [46-filspatchen](</Users/admin/Documents/Verkli/Plattformschecklista-2026-09-14/Verkli-andringar-per-fil-2026-09-14.diff>). Patchen är granskningsunderlag, **inte** en färdig cherry-pick. X1:s kampanj/payout/export ligger efter första säkra AI-beta.

En [färdig granskarbrief](2026-09-15-claude-review-brief.md) är förberedd för användaren att skicka till Claude. Den har inte skickats via mejl, chattjänst eller extern bot av Codex.

## 7. Kort QA-script för nästa reviewer

1. Kontrollera kandidatens `git rev-parse HEAD`, bas och filhashar mot manifestet; granska bara det tilldelade paketets diff.
2. För S1-GATE: läs RED-loggen och kör releasegrindernas regressionstest; kräv exit 1 vid verkligt fel och dokumenterat diagnostic-skip vid saknade uppgifter. Full unit/lint/typer/build körs på integrationskandidaten.
3. För F1: använd den utvecklingsbegränsade localhost-fixturen och `qa-f1-author-details.mjs`; prova avbruten importstatus, dubbelsläpp, tomt/ogiltigt pris, etikett/tangentbord och mobilbredd. Detta ersätter inte autentiserad resa.
4. För storage: kontrollera legitim bok/legacy-wav och främmande bucket/bokprefix; signeraren ska aldrig anropas för nekad referens. Kör separat riktig behörig uppspelning först med fastställda testkonton.
5. Efter beslutade databasändringar: kör samma metadata-SELECT igen och jämför effektiva rättigheter, triggers och samtliga tillåtande policyer. Kör verkliga felprov för import/översättning/autosave innan de stängs.
6. Slutligen Q1 på **en** kandidat-SHA: inbjudan → login → import → redigera/reload → granskad översättning → kort ljudprov → behörig läsare samt separat test av köp/inbox. Ingen kritisk skip får döljas bakom grönt totalantal.

**Beta är ännu inte godkänd.** Nästa leverans är granskade och integrerade blockerarfixar med gemensamt bevis, inte fler allmänna design- eller agentprojekt.
