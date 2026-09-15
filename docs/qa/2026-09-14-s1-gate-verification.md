# S1-GATE — verifierad lokal kandidat

2026-09-14. **S1/Claude behåller den oberoende granskarrollen. Codex äger implementation och integration.** Skicka detta dokument till S1 för nästa granskning; ingen uppgift har skickats till Claude automatiskt.

## Kandidat och omfattning

- Worktree: `/Users/admin/verkli-web/.claude/worktrees/s1-release-gates-20260914`.
- Branch: `codex/s1-release-gates-20260914`.
- Bas: `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`, samma R0-bas som F1.
- Status: lokalt verifierat granskningspaket. Aktuellt commit-SHA lämnas i överlämningen den 15 september; det äldre hashmanifestet avser källsnapshot före commit. Ingen merge eller deploy i detta paket.
- Originalrapporten är bevarad oförändrad. Se [triage och ansvar](../plans/2026-09-14-s1-integration-triage.md) för korrigeringar av de föreslagna säkerhetsfixarna.

| Ändrad produkt-/testfil | Beteende och syfte |
|---|---|
| `apps/web/scripts/check-billing-catalog.ts` | Rapporterade fel ger exit 1 också utan strict. Saknade indata är diagnostisk skip, men strict failar. |
| `apps/web/scripts/check-stripe-webhook.ts` | Samma felregel; utebliven endpointkontroll är skip/fail enligt strict. Aktiv wildcard-prenumeration täcker de hanterade eventtyperna. |
| `apps/web/scripts/check-rls-paywall.ts` | Fel/crash/misslyckad inventering kan inte bli pass. Saknad bok eller kapitel är inget åtkomstbevis. Okänd 401/403, HTTP 500 och felaktigt svar failar. Den specifika rättighetsnekningen för chapters godtas endast med fungerande anonym läsning av samma publicerade boks metadata. |
| `apps/web/scripts/qa-beta.mjs` | Catalog, webhook, kökonsument och paywall körs med strict så obligatoriska skip inte ger grönt releaseresultat. |
| `apps/web/scripts/release-security-checks.test.ts` | 41 subprocessfall kör de riktiga kontrollscripten med kontrollerade svar och exitkoder. |
| `apps/web/scripts/release-security-checks.fixture.mjs` | Hermetiska tjänstesvar, avstängd dotenv-inläsning och spärr mot oväntade socketanslutningar. Orkestreringens Redis/underkommandon mockas. |

Ingen ny dependency eller ändring av manifest/lockfil. Ingen ändring av schema, grants, RLS, lagringsinställningar, kunddata eller UI.

## Resultat

| Kontroll | Resultat | Bevis |
|---|---|---|
| Nya regressioner mot gammal kod | **29 fail / 12 pass**, förväntad RED | `S1-GATE-evidence/red.log` |
| Nya regressioner mot kandidaten | **41 pass** | Ingår i full unit; även riktad körning utförd |
| Full unit | **177 filer / 1 881 tester pass** | `S1-GATE-evidence/unit.log` |
| TypeScript utan emit/incremental | **PASS** | Kördes av implementeraren; även typkontroll i produktionsbygget |
| Full ESLint | **PASS, exit 0** | `S1-GATE-evidence/lint.log` |
| Ordinarie Next/Turbopack-build | **PASS, exit 0**, 159 statiska sidor | `S1-GATE-evidence/build.log` |
| Diffkontroll | **PASS** | `git diff --check` |

Bevismappen finns i `/Users/admin/Documents/Verkli/Lansering-2026-09-14/`. `candidate-sha256.json` där identifierar filinnehållet före commit; granskaren ska kontrollera att kandidaten inte ändrats sedan testningen.

Bygget kördes utan produktionshemligheter, med dummy-konfigurationen dokumenterad i buildloggen. Installerade native/serverberoenden flyttades reversibelt ur just detta worktrees node_modules enligt repots Docker-byggförberedelse. `dependency-preparation.json` visar flyttarna; inga källfiler eller dependency-versioner ändrades. Sentry varnade för utebliven auth token/source-map-upload; edge-runtimevarningen kvarstår. Ingendera stoppade bygget. Inga betalda AI-/Stripe-operationer kördes.

## Reproduktion

Kör från worktreet ovan. Node 22.17.0 användes. Den riktade körningen läser inga riktiga projekt-envfiler och kan köras med tom miljö:

```sh
env -i PATH=/Users/admin/.nvm/versions/node/v22.17.0/bin:/usr/bin:/bin NODE_ENV=test /Users/admin/.nvm/versions/node/v22.17.0/bin/node node_modules/vitest/vitest.mjs run --root apps/web scripts/release-security-checks.test.ts --reporter=dot
```

Full unit använder samma kommando utan testfilens argument. TypeScript kördes med `node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false`. Full lint och build kördes med `npm run lint -w @verkli/web` respektive `npm run build -w @verkli/web` i en rensad miljö; buildloggens första JSON-rad anger exakt dummy-konfiguration.

## Vad som inte är verifierat

- Oberoende S1-granskning av kandidaten återstår. Codex har gjort första diffgranskningen.
- `qa:beta` har inte körts mot produktionens riktiga Stripe, Redis eller databas. Testerna bevisar kontrollernas beteende vid simulerade svar, inte att tjänsterna är rätt konfigurerade live.
- Betalväggsprovet är fortfarande ett stickprov av en betald bok och ett kapitel. Det ersätter inte prov med två konton, samtliga pris-/publiceringslägen och versionsvarianter.
- Inga nya UI-/localhostresor behövdes eller kördes för detta scriptpaket. F1 verifierar bokflödets separata UI-ändringar.
- De övriga sju blockerarna är öppna; gatefixen gör dem inte åtgärdade. S1-01 är en lokalt verifierad kandidat, inte stängd live.

## Öppna metadatafrågor

Codex läste produktionsbucketens metadata vid `2026-09-14T16:27:03.700Z`: **chapter-media är publik och tom, 0 filer**. Två Supabase-anrop, noll filnedladdningar och noll mutationer. Bevis: `S1-GATE-evidence/chapter-media-inventory.json`. Koden använder den för bilder i manus. Tom idag betyder inte att framtida uppladdningar får rätt sekretess.

För profiles behövs fortfarande effektiva rättigheter, constraints, triggerdefinitioner och policyer. Kör hela [2026-09-14-s1-readonly-inventory.sql](2026-09-14-s1-readonly-inventory.sql) i Supabase SQL-editorn och lämna JSON-resultatet till Codex/S1. Den är en enda SELECT och returnerar inga kontorader, e-postadresser, fil-URL:er eller manus. **SQL-frågan är förberedd men inte körd.** Resultatet behövs innan en korrekt, konkret rättighetsmigration kan godkännas; kolumn-REVOKE ensam kan vara verkningslös när tabellprivilegiet finns kvar.

## S1:s nästa uppdrag och QA

1. Bekräfta bascommit och jämför kandidatens sex kod-/testfiler med SHA-256-manifestet. Läs den filvisa diffen.
2. Kör de 41 regressionerna. Granska att både negativa och positiva fall använder de riktiga scripten och att test-fixturen inte döljer felaktiga exitkoder.
3. Kontrollera särskilt obligatorisk skip, okända HTTP-/authfel, saknad betald fixture, fungerande kapitelnekning och webhookens wildcard. Granska att `qa-beta` inte bygger vidare efter ett fel.
4. Läs de fullständiga lint-/unit-/buildbevisen och SQL-inventeringen. Bekräfta att åtkomstfynden fortfarande står öppna; granska först metadata innan DB-fix väljs.
5. Lämna **PASS eller FAIL för S1-GATE**, med exakt fil/fel och återstående risk. Skriv inga produktändringar i granskarrollen. Vid PASS integrerar Codex och registrerar slutligt commit-SHA; varje efterföljande säkerhetspaket får egen oberoende review före beta.

## Omverifiering och paketering 15 september

Produkt- och testfilerna är oförändrade mot det frysta manifestet från 14 september. Full lint, TypeScript utan incremental, 177 unitfiler / 1 881 tester och ordinarie Turbopack-build har körts om: samtliga exit 0. Loggar och checks.json finns under `/Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/`. Den ursprungliga S1-rapportens nya verifieringskriterier har kopierats oförändrade från root inför denna överlämning.

S1-01:s krav är täckt av regressioner för samtliga tre scripts: fel failar utan strict, diagnostiska skip passerar utan strict, och den verkliga releaseorkestreringen kräver strict. Tidigare RED-logg visar att 29 av 41 fall fallerar utan fixarna. Detta är ett granskningsunderlag; oberoende S1-PASS och verifiering på samlad release återstår.

S1-00/02/03:s nya kriterier behöver också de tillägg som redan finns i triagedokumentet: effektiva och ärvda tabellprivilegier samt INSERT/DELETE måste kontrolleras; fast bucket utan bunden objektsökväg är otillräckligt; alla kvarvarande tillåtande storage-policyer måste inventeras. Enbart frånvaro av två policynamn bevisar inte nekad åtkomst. Detta ändrar inte granskarens dokument, utan är Codex konkreta invändningar inför DB-fix.

Den konfigurerade Husky-wrappern saknas i detta isolerade worktree. Ingen hookkonfiguration ändras och ingen exekverad hook hoppas över; ovanstående kontroller har körts uttryckligen. Det bevaras i commitöverlämningens verifieringsgräns.
