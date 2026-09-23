# F1 — tilldelning: import, pris och publiceringsdetaljer

Tilldelad 2026-09-14 av Codex, integrationsägare. Ägare: det befintliga Codex-uppdraget **Granska bokflödets UI** (`01a0a079-c547-7f40-a954-373638929bf5`). Implementationen får starta enligt denna avgränsning. Detta är första delpaketet av F1, inte en verifiering av hela bokflödet.

## Arbetskopia och underlag

- **Worktree:** `/Users/admin/verkli-web/.claude/worktrees/f1-author-details-20260914`
- **Branch:** `codex/f1-author-details-20260914`
- **Bas:** `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`, från `codex/release-integration-20260914` (även bekräftad på origin).
- **Gemensamt uppdragsdokument:** `docs/plans/2026-09-14-launch-task-pack.md` i detta worktree; F1-raden och avsnittet **F1 / design och verkliga tillstånd**.
- **Design:** `DESIGN.md` i samma worktree. Använd befintliga komponenter, färgvariabler och kontrollstorlekar.
- **Testmiljö:** `docs/plans/2026-09-14-q0-test-preparation.md` och `docs/qa/2026-09-14-r0-verification.md`.

Sätt uttryckligen detta worktree som arbetskatalog för varje kommando och använd dess absoluta sökvägar för redigering. Uppdragets ursprungliga cwd pekar fortfarande på root; ändra inte där. Kopiera inte den äldre rootversionen över releasebasen. Rotens och andra uppdrags pågående ändringar ska ligga kvar.

## Exklusivt filägarskap för denna leverans

Sökvägarna nedan är relativa till worktreet ovan. Statuskontroll i registrerade worktrees visade inga ocommittade ändringar i de sex föreslagna produkt-/E2E-filerna vid tilldelning.

| Fil | Tilldelning |
|---|---|
| `apps/web/src/components/import/ImportBookModal.tsx` | Ändra: statusfel/återhämtning och spärr mot parallell uppladdning. |
| `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PricingPanel.tsx` | Ändra: stabilt prisutkast, fokus och Free/Paid-val. |
| `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/PublishPanel.tsx` | Ändra: beskrivningens etikett och mobiltypografi. |
| `apps/web/src/app/(app-author)/author/books/[id]/BookWorkflowHeader.tsx` | Verifiera först. Releasebasen har redan `h-11 w-11` på pilar och `min-h-11` på steglänkar. Ändra endast vid ett reproducerat återstående fel, med test. |
| `apps/web/e2e/import-campaign-details.authed.spec.ts` | Endast importregressionerna. Lämna kampanjdelarna oförändrade. |
| `apps/web/e2e/author-control-details.authed.spec.ts` | Lägg till riktade F1-regressioner; ändra inte befintliga översättnings-/läsartester eller gör deras skips till ett godkännande. |
| `apps/web/src/app/(app-author)/author/books/[id]/BookWorkflowHeader.test.tsx` | Befintlig navigeringsregression; utöka endast om en navigationfix kräver det. |

Om autentiserad browser-QA fortfarande stoppas vid inloggning får du dessutom, endast för isolerad komponent-QA:

- Utöka `apps/web/src/app/dev/book-workflow/WorkflowPreview.tsx` med de riktiga komponenterna och syntetiska fixturedata. Bevara befintlig omslags-/assistentfixture och dess beteende.
- Lägga till `apps/web/scripts/qa-f1-author-details.mjs`, enligt befintliga `qa-book-workflow.mjs`, med kontrollerade API-svar och fel. Ingen ny dependency behövs.

Lämna `dev/book-workflow/page.tsx` och dess development-only-spärr oförändrade. En lokal komponentfixture är inte bevis för verklig inloggning, importworker eller sparning. Eventuella ytterligare filer listas med skäl till integrationsägaren före ändring.

**Andra ägare:** E1 äger editoraggregatorerna, autosave-/kapitelhooks och korrekturpanelerna. B2 äger importworker, kö och backendkontrakt. Delade UI-primitiver, globals.css, DESIGN.md, manifest, lockfil, auth, schema och CI ändras inte i F1. Ingen refactor eller ny designriktning.

## Fynd och acceptans

1. **Importstatus, P1:** Nätverksfel och HTTP-fel ska visas begripligt utan att kasta senast kända jobb eller visa ett falskt tomt läge. Aktiva jobb ska fortsätta kunna återhämta sin status. Tomt läge ska grundas på ett lyckat svar. Abort vid stängning/ersatt anrop är inte ett nytt användarfel. Testa fel följt av lyckat svar och att gamla svar inte ersätter nyare status. Bevara befintlig återställning när dialogen verkligen stängs och öppnas igen.
2. **En uppladdning åt gången, P2:** Samma spärr ska omfatta filväljare och drag/drop, även två snabba händelser före Reacts nästa render. Ignorerad extrafil ska inte ändra den pågående filen, jobb-ID eller rättighetsbekräftelser. Spärren ska släppa efter både lyckat svar och fel.
3. **Prisredigering, P2:** Användaren ska kunna tömma och skriva om priset utan att fältet försvinner eller tappar fokus. Free/Paid-valet ska vara uttryckligt och stabilt under redigering. Bevara kontraktet med numeriska minor units, valuta och befintlig Save-hanterare. Ogiltigt/tomt utkast får inte tyst spara ett gammalt pris eller göra boken gratis. Kontrollera decimalinmatning och externa prop-uppdateringar, exempelvis återställning från sparat värde. Ändra inga prisregler eller servervalideringar.
4. **Stegnavigering:** Granskningen läste en äldre implementation. Kontrollera den nya basens verkliga tryckytor, fokus, ordning och responsivitet; gör ingen onödig headerombyggnad.
5. **Beskrivning, P2:** Koppla synlig label till textarea med stabilt id/htmlFor och håll minst 16 px text på mobil. Bevara beskrivningsutkast och befintlig autosave på blur. Kontrollera båda teman.

## Körning och verifiering

Node 22.17.0 finns i `/Users/admin/.nvm/versions/node/v22.17.0/bin`. `npm ci --ignore-scripts --no-audit --no-fund` är redan kört mot låst dependencyträd. Inga miljöfiler eller kontosessioner har kopierats in.

Ren produktkodsbas har kontrollerats på nytt i detta worktree: `npm test -w @verkli/web -- --maxWorkers=2` gav **176 filer / 1 840 tester PASS**, exit 0. Logg: `node_modules/.cache/f1-baseline/unit.log`. Detta är basverifiering, inte test av ännu oskrivna fixar. Port **3051** var ledig vid överlämning och kan användas för F1:s egen localhost-preview; kontrollera igen före start och stoppa inga andra uppdrags servrar.

Utgå från minimala regressioner som misslyckas före fix och passerar efter. Kör lint, TypeScript, unit och det vanliga Turbopack-produktionsbygget efter kodändring; använd inte webpackbygge som ersättning för detta. Installationen kan kräva samma lokala hantering av gamla optional/native-paket som redan dokumenteras i `docs/qa/2026-09-14-r0-verification.md` och `infra/docker/Dockerfile.web`; inga manifeständringar ingår.

Browserprov ska använda syntetiska data och mockade import-/pris-/beskrivningsskrivningar. Installera avlyssningen före första interaktion, eftersom bland annat beskrivning sparas på blur. Starta inga workers, betalningar, utskick eller riktiga AI-anrop. Kör inte den generella `test:e2e`-sviten: den innehåller andra resor och riktiga provideranrop. Kopiera inte rootens `.env.local`, skapa inte konton och ändra inte betaåtkomst för att få ett grönt test. Saknad godkänd auth är en redovisad testlucka; komponentproven kan ändå genomföras lokalt.

### QA, fem steg

1. Visa ett aktivt importjobb. Låt statusanrop misslyckas via nätverksfel respektive HTTP 500 och sedan lyckas; bekräfta kvarvarande jobb, felbesked, fortsatt pollning och återhämtning.
2. Håll en uppladdning väntande och släpp två filer snabbt; verifiera exakt ett POST. Prova igen efter uppladdningsfel och efter avslutat anrop.
3. Välj Paid, töm priset, skriv noll och sedan ett giltigt decimalpris. Kontrollera fokus, stabilt fält, validering och rätt minor-unit-värde vid sparning. Prova uttryckligt Free-val och återladdat sparvärde.
4. Navigera steg med tangentbord på 390/1440 px. Mät minst 44 px tryckytor, kontrollera en aktuell länk och ingen oavsiktlig horisontell sidscroll. Kontrollera också 320/768 om layouten ändras.
5. Fokusera beskrivningen via etiketten, skriv och lämna fältet med mockad sparning. Kontrollera värde, 16 px mobiltext, båda teman och reduced motion.

## Överlämning

Lämna exakt diff per fil, kandidatens bas/branch/commit om sådan skapats, testkommandon med utfall, lokal preview-URL och femstegs-QA ovan med faktiskt resultat. Skilj kodbelagt, komponentverifierat och autentiserat verifierat. Skriv inte att hela F1 eller hela plattformen är färdig när bara detta delpaket är testat.

Håll all leverans i den tilldelade grenen. Ingen merge, deploy eller push till `platform` från F1; integrationsägaren gör oberoende review och samlar releasen.
