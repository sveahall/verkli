# S1 — mottagning, korrigeringar och fixägare

2026-09-14. Integrationsägare: Codex. Oberoende slutgranskare: S1/Claude, som fortsätter read-only. Den ursprungliga [S1-rapporten](2026-09-14-s1-cso-security-review.md) är kopierad oförändrad från root; detta dokument rättar inte dess historik i efterhand.

## Beslut och aktuell bas

- R0 **är** färdigt och pushat på `codex/release-integration-20260914`, commit `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`. Rapportens uppgift att R0 inte körts är äldre än överlämningen. R0 är inte deployat; senast bekräftade `origin/platform` är `26d02239`.
- Nytt isolerat paket: `/Users/admin/verkli-web/.claude/worktrees/s1-release-gates-20260914`, branch `codex/s1-release-gates-20260914`, från exakt R0 ovan.
- **S1 behåller granskarrollen.** Codex skriver/koordinerar fixarna och gör första review; S1 får därefter kandidaten för oberoende kontroll. F1 fortsätter separat och äger inga av dessa filer.
- Inbjuden beta kan inte få ett säkerhetsgodkännande med dessa åtkomst- och dataförlustfynd öppna. R0:s tidigare gröna unit/UI-kontroller ersätter inte de saknade säkerhetsproven.
- Rapportens produktionsuppgifter är **rapporterade SQL-observationer från S1/Svea**, inte en ny produktionsverifiering av Codex. Ingen exploit har körts. Kodfynden nedan har jämförts med R0; detaljer i databasens faktiska rättigheter och triggers återstår.
- Inga databas-, RLS-, GRANT-, bucket-, konto- eller schemaändringar görs genom detta paket. Ett konkret DB-förslag kräver separat godkännande enligt projektets regel om schemaändringar.

## Korrigeringar som fixägare måste följa

| Rapportpunkt | Codex kontroll och justering |
|---|---|
| S1-00, kolumn-REVOKE | `REVOKE UPDATE (role, demo_mode)` har ingen effekt om UPDATE fortfarande ges på tabellnivå eller via andra medlemsroller/PUBLIC. Inventera **effektiva** privilegier med `has_table_privilege`/`has_column_privilege`, även INSERT och DELETE + återinsättning. Root/R0 har insert-own och delete-own för profiles i migrationerna; skydd för UPDATE ensamt är därför inte ett komplett rollskydd. Admin ingår i rollernas senare CHECK; fastställ faktiska constraints/triggers innan exploaterbarhet eller kompatibilitet påstås. |
| S1-01, testgrind | Bekräftad på R0. Billing-catalogs toppnivå-catch är redan exit 1; ändra inte den i onödan. Detekterat fel måste alltid faila. Diagnostisk skip kan fortsätta vara tillåten utan strict, men releasekedjan måste köra nödvändiga kontroller strict. HTTP-fel och saknad betald testbok får inte räknas som bevis för en stängd betalvägg. |
| S1-02, signerade filer | Bekräftade läsningar av klientpåverkad bucket och path finns i de tre angivna routarna. Att låsa endast bucket stoppar inte läsning av en annan boks fil i samma bucket. Validera också filens tillhörighet till den redan behörighetskontrollerade boken. Workern skriver bland annat `<bookId>/audiobook-*`, `<bookId>/audiobook-manifest-*` och `cache/<bookId>/<chapterId>-*`. Bevara relevanta äldre format först efter att deras ägarskap kan bevisas. |
| S1-03, storage-policyer | Rapportens breda policyer finns även i migrationskoden. Namngivna DROP räcker inte som efterkontroll när ytterligare PERMISSIVE-policyer kan ge samma åtkomst. Inventera alla SELECT/ALL-policyer och prova läsare A/B/anon samt behörig lyssning. Påstå inte att all legitim åtkomst är serverbaserad innan anropsplatser inventerats. |
| S1-04, återimport | Delete före upsert och catch-delete är bekräftade. Att flytta första delete räcker **inte**: lyckade tidigare upsert-batchar har redan ersatt originaltext och catch raderar fortfarande versionen. Kräv att originalet förblir oförändrat vid batchfel, processavbrott och konkurrerande redigering; en partiell import får inte blandas med originalet. Lösning med staging/atomiskt byte utreds före eventuell schemaändring. |
| S1-05, översättning | Delete före generation är bekräftad, också i enkapitelsläget. Per-kapitel-delete är alltså inte automatiskt säkert: gamla kapitlet försvinner före lyckat ersättningsresultat. Samordna med AI-02:s redan dokumenterade race där nyare måltext kan skrivas över. En gemensam sparningsägare, inte ett parallellt B2-ingrepp i translation-workern. |
| S1-06, autosave | Avsaknad av automatisk dränering efter transient fel är bekräftad på R0 och i den aktuella rootfilen. E1 äger filen. Före fix ska även navigation inom appen och ännu ej dränerad editor-debounce omfattas; `beforeunload` ensam stoppar inte intern navigation. |
| S1-07, avbryt | Startuppdateringen skriver över cancel; felet bekräftat. Skrivningen efter kontrollfrågan i `waitWhilePausedOrCancelled` sker villkorligt vid återgång från paus, inte vid varje normalt kapitelvarv. Racet och de många output-skrivningarna behöver ändå lösas. Att bara läsa/merga output på nytt är inte atomiskt. Nya kontrollkolumner är ett schemaförslag, inte redan godkänt. Fel i kontroll-/slutstatusskrivning måste hanteras. |

PostgreSQL beskriver privilegiesummering och den verkningslösa kolumn-revoken under kvarvarande tabellprivilegium i [REVOKE-dokumentationen](https://www.postgresql.org/docs/current/sql-revoke.html). Systemregeln ska därför omfatta GRANT, INSERT, UPDATE, DELETE/återskapande och RLS; en radpolicy har inte en egen lista över tillåtna skrivkolumner.

Rapportens generella “rensat”-påståenden ska behållas som granskarens avgränsade observationer, inte användas som globala garantier. S1-02 visar exempelvis att DB-lagrad path/bucket är en klientpåverkad tillitsgräns trots att normala uppladdningsnycklar byggs på servern. RLS-problem kan inte uteslutas av enbart API-ägarkontroller. De medelallvarliga fynd som är granskarrapporterade behöver egen reproduktion. Antalet sådana rader i tabellen är fem (M4, M5, M8, M9, M10), inte fyra.

## Paket och ansvar

| Paket | Ägare och status | Exakt första avgränsning / stängningskrav |
|---|---|---|
| **S1-GATE** | Codex-implementerare `s1_gate_fix`, **VERIFIERAT LOKALT — VÄNTAR PÅ S1-REVIEW** | `apps/web/scripts/check-billing-catalog.ts`, `check-stripe-webhook.ts`, `check-rls-paywall.ts`, `qa-beta.mjs`, `release-security-checks.test.ts` och `release-security-checks.fixture.mjs`. Faktiska scripts testas med mockade tjänster: problem/crash → fail även utan strict; saknade krav → skip diagnostiskt men fail i release; giltigt fall → pass. 41 regressioner PASS; full unit 177 filer / 1 881 tester PASS, TypeScript, full lint och ordinarie Turbopack-build PASS. [Verifiering och reproduktion](../qa/2026-09-14-s1-gate-verification.md). Oberoende S1-review och gemensam integration återstår. |
| **S1-DB** | Codex DB-förberedelse, **VÄNTAR PÅ INVENTERING** | S1-00, S1-03, skrivskydd för ai_jobs/audiobook_assets samt policydrift. Läsfråga finns nedan. Efter inventering: explicit kolumnallowlist, kompatibilitet med profilinställningar och adminflöden, rättighetsprov för andra användaren/anon, tydlig migration + återställningsplan till beslut. Inga produktionsändringar nu. |
| **S1-STORAGE** | B1/Codex, **NÄSTA KODPAKET** | `api/author/jobs/route.ts`, `api/books/[id]/audiobook/status/route.ts`, `api/books/[id]/jobs/route.ts` under `apps/web/src/app`; eventuell gemensam validator i `src/lib/tts` först efter snäv tilldelning. Testa både främmande bucket och annan boks sökväg inom godkänd bucket. Ingen service-role-signering vid nekad tillhörighet. |
| **S1-IMPORT** | B2, **PLANERAT** | `apps/web/scripts/import-worker.ts` och tilldelade importpersistenstester. Fel efter första/senare batch och processavbrott får inte förstöra original. Samordnas med DB om atomiskt byte kräver RPC/schema. F1:s uppladdningsspärr är inte serverdeduplicering. |
| **S1-TRANSLATION** | AI-02, **SAMORDNAS MED BEFINTLIG ÄGARE** | Före detta paket ska både godkänt tidigare resultat och nyare användarredigering skyddas. Ingen annan ändrar translation-workern parallellt. |
| **S1-AUTOSAVE** | E1, **ÄNDRINGSUNDERLAG KLART** | `useChapterCrud.ts`/befintlig autosavekedja inom E1:s område. Offline → online utan ny tangenttryckning ska spara senaste text. Testa även borttaget kapitel, unmount och intern/extern navigation utan tyst förlust. |
| **S1-AUDIO** | A1/A2:s gemensamma ägare, **PLANERAT** | Worker + kontrollroute som ett paket. Avbryt köat, pausat och pågående jobb; ingen efterföljande providerstart efter att avbrottet observerats. Ett redan pågående provideranrop kräver separat avbrottsstöd; lova inte retroaktivt noll kostnad. |

Endast S1-GATE är startat i denna överlämning. Övriga rader är ordnad tilldelningsplan, inte påståenden om aktiva implementerare. S1 granskar varje färdig kandidat och därefter den gemensamma releasen. Produktionens rättighetsprov görs först på godkända fixtures; negativa metadataobservationer är inte ett utfört exploitprov.

## De öppna frågorna

**chapter-media:** koden visar redan användningen. `TiptapEditor.tsx` anropar `uploadChapterMedia`; `src/lib/supabase/storage.ts` skriver `<bookId>/<chapterId>/<timestamp>.<ext>` i bucketen och returnerar en publik URL. Den är avsedd för bilder/media i manus, inte endast generiska marknadsföringsbilder. Codex gjorde en egen read-only metadata-inventering mot den verifierade produktionshosten: **publik bucket, 0 filer, hela listningen klar**, inga filnedladdningar eller mutationer. Observation `2026-09-14T16:27:03.700Z`; 2 Supabase-anrop. Bevis: `node_modules/.cache/s1-verification/chapter-media-inventory.json` i S1-worktreet. Frågan om aktuellt innehåll är därmed besvarad för observationstillfället. Risken att framtida manusbilder blir publika kvarstår; en tom bucket bevisar inte ett korrekt åtkomstskydd.

**profiles:** triggernamn ensamt avgör inte vad triggern skyddar. Läs triggerdefinition, funktionsnamn, constraints och faktiska privilegier. Den kompletterande [read-only SQL-frågan](../qa/2026-09-14-s1-readonly-inventory.sql) ger ett JSON-resultat, så SQL-editorn inte gömmer tidigare resultatsatser. Den ändrar ingenting och returnerar inga konton, e-postadresser, objektlänkar eller manus. Triggerfunktionernas relevanta kod kan därefter granskas om namnen inte redan matchar känd migrationskod.

S1:s uppgift om noll providerkostnad kan stämma samtidigt som användaren körde read-only SQL mot produktion. I bevisregistret ska det heta **0 provideranrop / 0 SEK; produktionsmetadata läst via SQL enligt rapport**, inte noll externa systemkontakter. Rapporten ändrar dessutom en dokumentfil; ingen produktkod är ändrad av granskaren.

## QA och överlämning

1. Kör de riktade gate-regressionerna hermetiskt och bekräfta att de skulle misslyckas med den gamla koden.
2. Kör lint, TypeScript, unit och ordinarie Turbopack-build på S1-GATE; inga produktionsnycklar eller provideranrop behövs.
3. Granska SQL-inventeringens effektiva rättigheter, triggers och storage-policyer innan ett konkret DB-förslag godkänns.
4. Efter respektive kodfix: prova attackerande data med mockad signering samt batch-/offline-/avbrottsfel. S1 granskar kandidat-SHA och resultaten oberoende.
5. Efter godkända databasändringar: bevisa rättighetsutfall och behöriga kundresor i namngiven miljö. Först därefter kan de faktiska säkerhetsblockerarna stängas.

Allt är fortfarande en lokal kandidat. Inga publicerade manus, produktionsgrants, bucketinställningar, konton eller betalflöden har ändrats av denna mottagning.
