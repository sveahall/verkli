# Verkli — uppdrag, filägarskap och agentbriefar

14 september 2026. Kompletterar [lanseringsplanen](2026-09-14-launch-command-plan.md). R0 är nu **VERIFIERAT LOKALT**, utan commit/push/deploy; livebaseline är fortsatt `26d02239`. Q0-förberedelsen och AI-handoffen är klara. Övriga uppdrag behåller angiven status. Externa Claude-, Cursor- och Grok-uppdrag har **inte startats**. Rootarbetet är samordnat med **Sammanställ plattformsplanen**, som lämnat sin lokalt verifierade leverans för integrationsgranskning.

## Releasekarta vid planering

| Plats / branch | Status | Hantering |
|---|---|---|
| `origin/platform`, `26d02239` | Senast verifierad release; Node 22-fix `1293e720` ingår | Hämta aktuell remote-SHA före genomförande; stäm av drifts-SHA. Detta är bas, inte root. |
| `/Users/admin/verkli-web`, `codex/launch-qa-20260910`, HEAD `e49d3c40` | Fyra ointegrerade QA-commits plus omfattande pågående ändringar | Läs och inventera. Ingen återställning, mass-staging eller push. |
| `.claude/worktrees/translation-quality-20260914`, `codex/translation-quality-20260914` | HEAD `61c833da` och omfattande ocommittad kvalitetskedja | Paketera med nuvarande ägare, reviewa och lyft relevanta commits. Kopiera inte allt över releasebasen. |
| `.claude/worktrees/book-workflow-20260914` | Senast ren på `26d02239`; UI-preview på 3025 | Bevara preview och det redan släppta UI-arbetet. |
| `.claude/worktrees/launch-command-20260914`, `codex/launch-command-20260914` | Isolerat planeringsarbete baserat på `26d02239` | Endast dessa planeringsdokument. |
| `.claude/worktrees/release-integration-20260914` | Bas `26d02239`; verifierat staged träd `20d73d3665021c84fe88f8946f1c2a57ab65a043`, 21 filer före dokumentöverlämning, ingen commit/push/deploy | Fyra QA-commits samt mejlretry- och SSR-fix; full avgränsad lokal gate PASS. Preview 3031. Gemensam dokument-/kodöverlämning återstår. |

Sökvägar med `.claude/worktrees` ovan ligger under `/Users/admin/verkli-web`. Kontrollera färsk `git status`, aktuell ägare och aktiva processer innan något återanvänds. Lokala workers har tidigare varit kopplade till produktionsdatabas; starta inte ännu en worker med kopierade env-filer.

## Uppdragsregister

Statusord: **PLANERAT → PÅGÅR → REVIEW → VERIFIERAT LOKALT → INTEGRERAT → VERIFIERAT LIVE**. `BLOCKERAT` kräver exakt beroende; `FEL` kräver reproduktion. Separat kolumn/bevis anger riktig provider- och kundreseverifiering.

Tiderna är grova arbetsintervall, inte summerbara löften om kalenderleverans. En agent får inte automatiskt ta ett ledigt ID; integrationsägaren bekräftar ägare och filer först.

| ID | Prioritet / föreslagen ägare | Leverans | Beroende | Intervall / startläge |
|---|---|---|---|---|
| **R0** | P0 / Codex release | Fyra QA-commits och granskade mejlretry-/SSR-fixar i isolerad kandidat | Kod-/dokumentöverlämning; commit och eventuell release är separata nästa handlingar | VERIFIERAT LOKALT: lint/tsc/build, 1 840 unit, 10/10 launch, 3/3 utan JS; ej live |
| **Q0** | P0 / QA + release | Inventering och exakt uppdelning av kostnadsfria/provider/köp-sviter samt befintligt konto A | Miljö för senare kundresor, konto B/läsare och inbox kvar att fastställa | FÖRBEREDELSE KLAR; full kundrese-QA ej utförd |
| **B1** | P0 / backend | Inbjudan/login/redirect och betalning/leverans bevisad på R0 | R0, Q0 | 4–8 h / PLANERAT; befintliga fixar återanvänds |
| **B2** | P0 / backend jobs | Importintegritet, kökonsumtion, fel/avbrott/återförsök och korrekt progress | Q0, aktuell runtime | 4–8 h / PLANERAT |
| **AI-01** | P0 / AI-arkitekt | Två filer: Anthropic-factoryparitet och hermetisk regression | Verifierad R0-kandidat före isolerad integration | HANDOFF KLART; ännu inte integrerat |
| **AI-02** | P0 / AI-arkitekt + senior | Integrera kvalitetskedjan; skydda nyare måltext och tidigare resultat, kalibrera reservation | AI-01; fixbeslut/regression för måltextsrace; Q0 för riktiga körningar | ERSÄTTNINGSFLÖDE BLOCKERAT av målöverskrivning P0; inte R0-blockerare |
| **AI-03** | P0 / QA + tvåspråkig granskare | Lås separat testmaterial; verklig 3-kapitelsresa efter tillåten budget; granska betydelse/röst | AI-02, Q0, mänsklig läsning | ½–1 dag för beta; ytterligare 1–2 dagar för utökat material |
| **E1** | P0 / befintligt rootuppdrag → integrationsägare | Korrektur godkänn/avvisa, kapitelanalys och manuell översättningsgranskning utan stale overwrite | Överlämnad diff måste granskas; R0 före integration | VERIFIERAT LOKALT enligt leveransrapport, väntar oberoende integrationsreview |
| **A1** | P0 / audio backend + QA | Verkligt kort ljudprov till fil, manifest och behörig läsare; testa fel och återförsök | Q0, B1 för köparåtkomst | ½–1 dag / PLANERAT |
| **A2** | P1 före längre audio / audio specialist | Första ljud-QC: teknisk filkontroll, källhash, genomlyssning och riktad kapitelomkörning | A1 | 1–2 dagar / PLANERAT; full ljudförståelse ingår inte |
| **F1** | P0 / **Granska bokflödets UI** | Första delpaket: importstatus/dubbeluppladdning, prisutkast och beskrivningsfält; se [exakt tilldelning](2026-09-14-f1-author-details.md) | Isolerat från R0 `e9544c19`; E1 äger sina editorfiler. Full omslags-/kundrese-QA kvar. | TILLDELAT: `codex/f1-author-details-20260914`; ännu inte implementerat/verifierat |
| **P1** | P0 / läsare backend + QA | Publicerad testbok, bibliotek, läsning, ljudåtkomst/resume; rätt kapitelrättigheter | B1, A1; befintliga spelarändringar paketeras först | 4–8 h plus enhetstid / PLANERAT |
| **S1** | P0 / CSO, separat granskare | Tvåförfattarisolering, privat lagring, betalvägg, API-spend och manipulation av manus/prompt | Kandidat; Q0 för aktiva prov | ½–1 dag / PLANERAT |
| **O1** | P0 / release + backend | Verklig workerhälsa, köålder, synliga fel, supportväg och rollback på rätt release | B2, A1, integrationskandidat | 3–6 h / PLANERAT |
| **Q1** | P0 / oberoende QA | Hela författar- och läsarresan på samma SHA; inga skippade kritiska tester | R0–O1 inom betans omfattning | ½–1 dag / PLANERAT |
| **X1** | P1 / befintligt rootuppdrag → integrationsägare | Kampanjutkast, read-only payoutöversikt, spelarkontroller och läsdataexport som separata paket | Royaltybeslut krävs endast för nya pengaflöden | Lokalt överlämnat; providerprov för kampanj, simulerad Stripe-verifiering. Ej villkor för första AI-beta |

### E1/X1 — mottagen överlämning

- Rapport i root: `docs/plans/2026-09-14-editorial-campaign-payout-delivery.md`.
- Diff: `/Users/admin/Documents/Verkli/Plattformschecklista-2026-09-14/Verkli-andringar-per-fil-2026-09-14.diff`.
- Manifest: `/Users/admin/Documents/Verkli/Plattformschecklista-2026-09-14/Verkli-andrade-filer-2026-09-14.txt`.
- 46 filer inklusive tidigare ljud-/exportarbete. Rapporten anger att diffen bevarar samtidiga ändringar i delade filer. Granska därför varje hunk och attribuera den; applicera inte hela diffen som om den vore ett redan isolerat paket.
- Inga commits eller deploy; den samlade releasekandidaten har alltså ännu inget bevis från dessa tester. Rapporterade 1 906 tester ska inte adderas till andra grenars testantal.
- Lokal produktionspreview lämnad på 3050. Riktiga AI-anrop och sparning gjordes i det andra uppdraget. Återanvänd det befintliga tillåtna testflödet i Q0 och stäm av faktisk providerförbrukning före nya budgeterade körningar.

## R0 — första integrationspaketet

**Aktuellt:** fyra QA-commits nedan är redan införda av R0-ägaren; starta inte en andra integration. En oberoende review hittade P1 där en gammal webhookclaim kunde stoppa ett misslyckat mejl för alltid. Fixen med separat `stripe_events`-acceptansmarkör efter faktiskt provider-ID, återförsök även på duplicate och 23 emailregressioner är granskad; P1 är stängt. Ingen ny dependency eller schemaändring. En ärvd P2 om feedback/checkout i samma Redis-rate-limitbudget tillhör B1/rate-limitägaren.

Verifieringskedjan är **1 817 unitpass på baspaketet → 1 834 efter mejlfix → 176 filer / 1 840 tester på fryst mejl + SSR-kandidat**; antal summeras inte. Basens launch-E2E gav **8/10**, där H1 på `/author` och pending-notisen väntade på cirka tio sekunders kall hydrering. SSR-fixen omfattar fem filer och är fryst och oberoende granskad: offentlig landning under authloading, serverparametrar till waitlist-klienten, oförändrade auth- och signuphistorikguards. Implementationens SSR-test gick från 3 fel/3 pass till 6/6, och SSR/mobil/metadata gav 18 pass. **Slutlig lint/TypeScript, normalt Turbopack-produktionsbygge och oförändrad launch-E2E 10/10 passerar utan skips/retries/timeoutändringar. Browserprov utan JavaScript passerar 3/3** för author-H1, pending-notis/länkar och vanlig waitlist utan notisen. Sista kontrollen slutade 15:49:48 UTC på oförändrat träd. Detta är lokal offentlig/hermetisk QA; riktig auth, köp, inbox och live återstår i respektive paket.

Bevis: [R0-verifiering](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-verification.md), [oberoende R0-review](/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914/docs/qa/2026-09-14-r0-review.md), [Q0-förberedelse](2026-09-14-q0-test-preparation.md), [AI-01/AI-02-handoff](2026-09-14-ai-integration-handoff.md). Source freeze är bekräftad, men inga framtida tester, commits eller releaser räknas som genomförda.

Fyra commits som saknades från release vid inventeringen och nu ingår i R0-kandidaten:

1. `5b36bb08` — keep Stripe and buyer support reachable during beta.
2. `acfeb14d` — email paid ebook buyers a durable download return link.
3. `0e9b60d3` — verify production gates and document remaining launch checks.
4. `e49d3c40` — recheck current payment before issuing ebook downloads.

Arbetsgång och releasekriterier (inventering, integration och lokal slutverifiering är utförda; kod-/dokumentöverlämning och releasehandlingar återstår):

- Läs diffarna och färsk historik från aktuell `origin/platform`; bekräfta att de fortfarande saknas. Utgå från ett nytt `codex/`-worktree. Om någon redan integrerat en fix: duplicera inte.
- Granska och integrera i ovanstående ordning. Konflikter granskas filvis; behåll både nyare UI/runtime och avsedda säkerhetskontroller. Ingen automatisk "ours/theirs" över hela filer.
- Oberoende review verifierar att det är **exakt webhookens POST** som undantas från betaspärr, medan signaturkontroll och privat åtkomst består.
- Verifiera middleware på **produktionsbygge**, eftersom dev/alternativ bundler tidigare har givit falsk trygghet. Använd Node 22 enligt repo.
- Kandidatens lint, TypeScript, unit och ordinarie Turbopack `npm run build -w @verkli/web` har passerat, med befintlig Docker-paritetsförberedelse för optional dependencies enligt `infra/docker/Dockerfile.web:57–82`. Verifieraren dokumenterar förberedelsen och slutkandidatens eget buildpass. Använd inte webpack som ersättning vid kommande paket. Den oförändrade `playwright.launch.config.ts` och offentlig SSR utan JavaScript har också passerat.
- Leverera kandidat-SHA, filvis diff, oberoende review och testbevis. Produktionspush är en separat, samordnad releasehandling; ingen annan agent deployar samtidigt.

## Filägarskap och kontrakt

| Filer / yta | Enda kodägaren tills överlämning |
|---|---|
| `apps/web/middleware.ts`, `src/app/api/stripe/webhook/**`, `src/lib/orders/ta-for-er-*`, betalnings-/inbjudansfixar | B1, efter R0. En befintlig root-diff i samma filer måste först attribueras. |
| `apps/web/scripts/import-worker.ts`, import-/köflödet | B2. Autosavehooks är E1:s område; ändringar där beställs genom ägaren. |
| `apps/web/scripts/translation-worker.ts`, `src/lib/ai/translation-quality/**`, `translation-quality-budget.ts`, providerfactory och translationpreview | AI-arkitekten. B2 får lämna reproduktioner, inte parallella ändringar i dessa filer. |
| `apps/web/scripts/audiobook-worker.ts`, ljudgenerering/manifest | A1/A2 samma ägare; separata sekventiella paket. |
| `src/app/api/books/[id]/audiobook/play/route.ts`, `src/lib/books/access.ts` under `apps/web` | P1 efter samordning med B1; en accessägare åt gången. |
| `src/lib/editorial/**`, editorial review-route, `EditorialReviewPanel.tsx`, `ReviewPanel.tsx`, `useChapterCrud.ts`, `useChapterCrud.review.*`, `BookEditorPanelContent.tsx`, `BookEditorView.tsx` | Befintligt uppdrag **Sammanställ plattformsplanen** (E1), tills dess verifierade överlämning. Frontendagent får inte ta dessa samtidigt. |
| `apps/web/scripts/marketing-worker.ts`, marketing copy-provider/generator och kampanjvyer; payoutreport och payoutöversikt | Samma befintliga uppdrag (X1). Ingen ny royaltylogik utan beslut. |
| Cover/Audio/Translate/Publish-panelernas tilldelade presentationsfiler | F1, först efter kontroll att ägare och aktuell rootdiff inte överlappar. Editoraggregator ändras via E1/integratören. |
| Delade UI-primitiver, `globals.css`, `DESIGN.md`, packagefiler, CI, gemensamma API-typer | Releaseintegratören. Andra lämnar en liten ändringsbegäran. |
| Nya release-E2E-filer och bevisregister | QA. Ändra inte produktionskod i samma QA-uppdrag. |

Filsökvägar med `src/` är relativa till `apps/web`, om inget annat står. Uppdragsägaren fyller in den faktiska, snäva fillistan före start; tabellen är ingen tillåtelse att ändra hela API- eller editorkatalogen.

**Gemensamma kontrakt låses i första vågen:** befintliga jobbstatusar + felkod, progress, käll-/resultatfingeravtryck, kvalitetsbeslut, betal-/åtkomstbeslut och kostnadsreservation. Bevara befintliga kontrakt där det går. Alla ändringar dokumenteras med exempel på lyckat svar och fel; frontend ska kunna visa ett meningsfullt återförsök. Ny tabell/RPC/schema kräver ett separat granskat förslag och Sveas beslut.

## Detaljerade acceptanskriterier

### Q0 / testmiljö och kostnad

- Inventera `.env`-mål via namn/host och test-/livemode utan att skriva ut hemligheter. Namnge DB, kö, storage, authkonton och godkänd inbox. Separata bok-ID:n för testdata; inga verkliga författarmanus som fixture.
- Dela tester i: hermetiska unit/UI, autentiserade datatest, opt-in providerprov, Stripe-testläge och produktionens tillåtna canary. En generell testsuite får inte starta LLM/omslag/ljud oförutsett.
- Saknade konton/behörigheter markeras blockerade. Staging eller godkända befintliga konton föreslås först; inga lösenordsresetar eller beta-grants på antagande.
- Lås per körning antal anrop/maxkostnad och loggformat. Börja med små originaltexter. Hela veckobudgeten är inte en per-agentbudget.

### B1 / inloggning, betalning och leverans

- Inbjudan → e-postlänk → inloggning → author home; logout/login och återställd session fungerar. Ej inbjuden får tydligt besked, ingen obegriplig loop.
- Lösenordsåterställning för det godkända testkontot: faktisk återställningslänk i godkänd inbox → ange nytt testlösenord → logga in → avsedd retur-URL. Utgången/återanvänd länk ger begripligt fel. Återställ aldrig en verklig användares lösenord som test.
- Osignerad webhook nekas av signaturkontroll; korrekt signerad testhändelse når handler under betaspärr. Signatureventreplay är idempotent.
- Testköp → en order/ett entitlement → fil/bibliotek → ett faktiskt mottaget återvändningsmejl. Pending/failure/expired/refund/dispute och obehörig nedladdning provas. API 200 ensamt är inte leveransbevis.

### B2 / manus och workers

- Minst två stödda importformat med rubriker, kursiv, dialog och flera kapitel. Räkna kapitel och jämför sparad text/formatering.
- Import med avsiktligt trasig fil, dubbelstart och workeravbrott ger synligt korrekt resultat; ingen "klar" före persistence. Körning måste kunna knytas till rätt kö och workerhost.
- Redigera → byt kapitel direkt → ladda om; senaste texten ska finnas kvar. Vid fel visas osparat tillstånd och användaren behåller texten. E1 äger eventuella hookfixar.
- Mät faktiskt återhämtningsbeteende. Audio har vid inventeringen 61 minuters lockDuration: byt inte värdet utan att prova långa jobb och låsförnyelse.

### AI-01–03 / kvalitet och sparning

- Sv→en preview och bokkö stöds konsekvent. Okända par returnerar tydligt samma begränsning; inga tysta andra providers.
- Granskarna citerar faktisk käll-/måltext. Strukturella kontroller hittar bortfall och felaktig täckning. En reparation omgranskas och går inte runt samma grind.
- Lås först separat material: minst 12 nya betafall i tre stilar, sex rena referenser och sex med fördefinierade allvarliga fel. Ta med negation, siffror, egennamn, fragment och dialog. Mänsklig tvåspråkig granskning fastställer etiketter före körningen. Alla sex allvarliga fel ska upptäckas, ingen ren referens ska blockeras som allvarlig och inget allvarligt reparationsintroducerat fel får godkännas. Mindre stilfynd bedöms separat. Utökningen omfattar 20–30 korta fall och ett längre flerkapitelsmanus. Utvärderingsetiketter och eventuell modelljämförelse hålls separata från promptutvecklingen.
- Bedöm allvarliga betydelsefel, röstskada, falska larm, reparationsintroducerade fel, kostnad och latens. Det finns ingen godkänd universell procentsats för "inte AI-text".
- Käll-/måländring under jobbet och två samtidiga jobb får inte koppla "checks passed" till annan sparad text. Gamla godkända översättningar bevaras vid misslyckad ersättning. Om garantin kräver transaktion/schema: dokumentera behov och blockera motsvarande betaoperation tills lösning beslutats; hävda inte att hashkontroll är atomisk.
- Reservationsenheter kalibreras mot riktiga anrop. Retry/dubbelstart/avbryt kostar enligt tydligt kontrakt; ingen dubbel intern debitering för samma operation. Ett timeout kan ändå inträffa efter att leverantören utfört och debiterat anropet: logga osäkert utfall, stäm av anrops-ID/förbrukning där möjligt och starta inte automatiskt om hela den betalda kedjan. Ett 3-kapitelsprov startas först när budgeten faktiskt tillåter det.

### A1–A2 / ljud och leverans

- Generera ett kort originalkapitel med namngiven standardröst; kontrollera fil/manifest, avkodning, full lyssning, början/slut, tystnad och upprepningar.
- Genereringsfel, lagringsfel och avbrutet jobb ska inte bli publicerat/klart. Återförsök får inte skriva över andra godkända kapitel eller oavsiktligt betala för hela boken igen.
- Fullt bokköp respektive kapitelköp provas om respektive köpväg erbjuds. Den köpta delen spelas; intilliggande obetald del nekas.
- Teknisk QC och mänsklig lyssning redovisas separat. Tal-till-text-QC är en senare avgränsad leverans, inte en garanti som redan finns.

### E1 / författarkontroll och fallback

- Förslag ändrar inget förrän det godkänns. Ändrad text sedan analysen ger konflikt/ny granskning, ingen överskrivning.
- Providerfel återger ett tydligt fel/degraderat läge; en deterministisk fallback får inte presenteras som granskad AI. Användarens fråga och text bevaras.
- Stora kapitel och markerat textområde ger rätt kontext; dokumentera om mitten av ett kapitel saknas i prompten. Lova inte helmanusförståelse från en kapitelanalys.

### F1 / design och verkliga tillstånd

- Följ `DESIGN.md` och de befintliga komponenterna. Prova tomt, laddning, fel, färdigt och sparat på 390/1440 px; kontrollera även 320/768 när layouten ändras.
- Tangentbord, fokus, Escape, båda teman, reduced motion och 44 px klickytor. Inget formulär pressas ihop när assistenten öppnas; inga utkast försvinner.
- Riktigt omslag: generera → välj → spara → reload. Fel lämnar tidigare omslag intakt. Verklig sparning/progress skiljs från visuellt exempel.
- Ingen ny hero, inga genererade mockups som ersätter fungerande arbetsflöde, inga dolda betalspärrar.

### S1 / CSO och O1 / drift

- Två författare + läsare + anonym: GET/POST/manipulerade ID:n mot manus, privat version, omslag, ljud och jobb. Enbart 403 för en roll är inte full isolerings-QA.
- RLS och direkt storageåtkomst provas med tillåtna fixtures. Service-role får inte nå klienten; signerade URL:er måste avse rätt resurs. Manus behandlas som data, aldrig som agentinstruktioner.
- Granska promptinjektion, loopar, långa indata och retries som kostnadsrisker. Använd befintlig Redisbudget som grund, bygg inte ett nytt agentsystem för bokföring.
- Driftkontroll kräver färska heartbeats för aktiverade workers, rimlig köålder och fungerande felrapportering; en Redisanslutning/HTTP 200 räcker inte.
- Återställning ska täcka kompatibilitet mellan webb, workers och köade jobb. Om nytt jobbformat inte kan läsas av gammal worker måste det lösas före release. Dokumentera tidigare kända fungerande revisioner, inte bara föregående release med kända fel.

## QA-repetition i sju steg

Kör på godkänd kandidat och namngivna konton. Dokumentera vad som sker i staging respektive produktion. Kontrollerade produktionsskrivningar, providerprov och köp kräver respektive klarlagda tillstånd.

1. **Inloggning:** inbjuden författare till arbetsyta; ej inbjuden och annan roll får rätt besked. Prova återinloggning, godkända testkontots återställningsmejl och rätt retur-URL.
2. **Manus:** importera eget prov, ändra rubrik/dialog, byt kapitel direkt och ladda om. Kontrollera innehåll, kapitelantal, formatering och sparstatus.
3. **AI:** begär och godkänn ett skrivförslag; generera en tillåten översättning, granska rapporten och verifiera sparad text efter reload.
4. **Omslag och ljud:** spara vald bild; generera ett tillåtet kort ljudprov och lyssna på hela. Testa fel/återförsök utan att förlora befintligt resultat.
5. **Läsare och köp:** öppna tillåten testbok, verifiera bibliotek/läsning/ljud. Testköp och leverans inklusive faktiskt mejl; obetald och återkallad åtkomst nekas korrekt.
6. **Isolering och mobil:** konto B får inte konto A:s innehåll. Prova tangentbord och mobil; längre audiorelease kräver verklig bakgrundslyssning och återupptagning.
7. **Drift:** kontrollera jobb-ID:n, rätt worker, felstatus, kostnad och logs. Återställningsprocedur och supportmottagning ska fungera före releasebeslut.

## Kopiera till varje kodagent

```text
Du arbetar som [ROLL] på Verkli-uppdrag [ID].
Mål: [konkret användarbeteende och acceptanskriterier från uppdraget].
Worktree: [absolut sökväg]. Bascommit: [verifierad SHA].
Du äger endast: [exakta filer]. Andra uppdrag äger övriga filer.

Läs AGENTS.md, DESIGN.md vid UI-arbete och relevanta källor i launch-planen.
Sök befintlig lösning först. Ändra minsta möjliga. Inga nya dependencies,
schemaändringar, kontobehörigheter eller produktionsinställningar utan beslut.
Ingen egen push/deploy till platform. Rör inte rootcheckout eller andra worktrees.

Testmiljö: [namngiven miljö och tillåtna fixtures].
Provideranrop: [inga / uttryckligt tilldelad leverantör, antal, kostnadstak].
Veckobudgeten delas; den är inte din egen budget. Starta inte generella
autentiserade AI-tester förrän vi vet vilka externa anrop de gör.

Visa begriplig progress, fel och tomma tillstånd. Bevara användarens data.
Kör riktade regressioner. Rapportera sedan kandidat-SHA, filvis diff,
testkommandon/resultat, provad miljö och kvarvarande luckor.
Skippade tester är blockerade, inte godkända. Om en delad fil måste ändras,
skicka ett konkret kontraktsförslag till integrationsägaren och fortsätt
oberoende arbete inom dina filer. Dölj inte blockerare genom mocks/fallback.
```

### Claude — seniorgranskare / CSO

```text
Granska tilldelat Verkli-paket [ID, bas-SHA, kandidat-SHA] read-only i
[worktree]. Du skrev inte ändringen. Kontrollera mot acceptanskriterierna.
Prioritera dataförlust, stale writes, dubbla debiteringar/genereringar,
tenantisolering, signerade filer, promptgränser och felaktigt successläge.
Lämna endast konkreta fynd med fil/rad, reproduktion, konsekvens och
minsta åtgärd. Skilj observerat fel från möjlig risk och ej körd kontroll.
Ge inget allmänt "secure" eller "AI-quality passed" från en kodläsning.
Starta inga provideranrop, kontoskrivningar, installationer eller deployer.
```

### Cursor — frontend och designer

```text
Genomför F1 i [tilldelat worktree] med [exakt fillista] från releaseägaren.
DESIGN.md och godkända /author är referensen. Behåll designriktningen.
Fokus: den verkliga författarresans laddning, sparstatus, fel, retry, tomma
tillstånd, responsivitet, dropdowns och fokus. Bevara utkast och original.
Du äger inte editorialpaneler, autosavehooks, editoraggregator eller globals.
Verifiera 390/1440 px, teman och tangentbord. Använd tydligt märkt fixture
för UI, men redovisa riktig persistence separat. Ingen oauktoriserad AI-kostnad.
Isolera underagenter; de får inte dela en aktiv skrivande checkout.
```

### Grok Bot — koordinator, börja med ett pilotuppdrag

```text
Du är leveranskoordinator för Verkli. Första uppdraget är read-only:
utifrån dessa tre tillgängliga tickets och PR-/testlänkar [LÄNKAR], skapa
en korrekt statuslista med ägare, bas/kandidat-SHA, verifierat resultat,
nästa beroende och exakt nästa handling. Säg okänt när bevis saknas.

Codex är integrationsägare. Du gör inga kodändringar eller releaser och
har inte automatiskt tillgång till Macs localhost eller privata repo.
Begär endast den specifika åtkomst som faktiskt behövs. Kopiera aldrig
produktionshemligheter, inloggningscookies eller API-nycklar till uppdraget.
Bots delar molndatorns filer/sessioner: skilj ägarskap och data även där.
Skapa inga externa meddelanden eller inbjudningar. När pilotens status
har kontrollerats kan du koordinera fler handoffs enligt samma bevisformat.
```

## Överlämningsmall och gemensam releasekontroll

```text
ID / ägare / status:
Bas-SHA → kandidat-SHA / worktree:
Användarbeteende före → efter:
Ändrade filer och filvis diff:
Verifieringskommandon, utfall och tidsstämpel:
Miljö + tillåtna testbok-/jobb-ID:n:
UI-bevis / provider-bevis / sparat resultat / live-bevis (separat):
Faktiska externa anrop och kostnad:
Ej kört / skippat / blockerare:
Oberoende granskare och kvarvarande fynd:
Kompatibilitet och rollback:
Nästa ägare / beroende:
```

Releaseägaren kör gemensam lint, TypeScript, unit och produktionsbygge efter integration; tidigare deltester räcker inte. Relevanta release-E2E och verkliga kundresor körs på samma kandidat. `qa:beta` får inte kallas full releaseacceptans om credentialsberoende steg har hoppats över. Aktivera strikta befintliga konfig-/billing-/webhook-/kö-/RLS-kontroller för rätt miljö och redovisa alla blockerade steg.

Inga verktyg är automatiskt sammankopplade genom dessa briefar. Codex kan styra sina tillgängliga underagenter här; Claude-/Cursor-/Grok-uppdragen är färdiga att starta i respektive verktyg eller genom en verifierad integration. En installerad app och en planerad roll räknas inte som ett startat arbete.
