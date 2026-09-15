# Nästa granskaruppdrag — klistra in hos Claude/S1

Fortsätt som oberoende read-only granskare. Codex äger implementation, integration och release. Ingen produktionskod, migration, SQL-applicering, betald körning eller massapplicering av diffar i detta uppdrag.

Läs först [dagens status](2026-09-15-launch-status.md). R0 är redan committad och pushad vid `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`; starta inte om R0. AI-kvalitetskedjan är säkrad som WIP vid `74aa9075b8a59550be78173ee827b637d8a8896f`; den är inte releasegodkänd. F1 är committad vid `3372782c2da4516ca80f40de7e6caeb60fddaf91`.

## Granska nu: S1-01

Worktree: `/Users/admin/verkli-web/.claude/worktrees/s1-release-gates-20260914`.

- Kandidat: `f9e53d8c3db4bfd15927f435c58fe618893ceb4f`.
- Bas: `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`.
- [Sex kod-/testfiler, filvis diff](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/S1-GATE-produktkod-per-fil.diff>).
- [Hela commiten inklusive rapport/kriterier och verifieringsdokument](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/S1-GATE-andringar-per-fil.diff>).
- Bevis: `docs/qa/2026-09-14-s1-gate-verification.md` i kandidatworktreet samt `/Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/`. RED-loggen ligger i motsvarande `Lansering-2026-09-14/S1-GATE-evidence/red.log`.

Kräv att verkligt upptäckt fel och oväntad exception ger exit 1 i vart och ett av de tre scriptsen även utan `--strict`; frånvarande indata får diagnostic-skip men ska faila i strict. Kontrollera att `qa-beta.mjs` faktiskt skickar strict till relevanta grindar och att negativa subprocess-tester fångar regressionsfallet. Bedöm också om den provtagna betalväggen är tillräckligt redovisad som provtagning; den är ingen fullständig tvåförfattarisolering.

Färska resultat: lint, typer, 1 881 unit-tester och normalt Turbopack-build PASS. Detta är lokalt, inte en livekörning av `qa:beta`.

## Granska därefter: S1-02:s kodförsvar

Worktree: `/Users/admin/verkli-web/.claude/worktrees/s1-storage-signing-20260915`.

- Kandidat: `717a98eaedebddb6d70037263a339aab168d50a5`, samma R0-bas.
- [Filvis diff](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-STORAGE-evidence/candidate.diff>) och [rapport](</Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-STORAGE-evidence/REPORT.md>).
- 143 riktade tester; med gamla R0-routes 84 fel/52 pass. Full unit 1 976, full lint/typer/Turbopack-build PASS.

Granska alla 11 signeringsvägar över tre routes. Bucket hämtas från serverkonfiguration, medan DB-bucket enbart läses för att **avvisa** främmande metadata. Den styr aldrig `storage.from`. Sökvägen måste dessutom matcha den behörighetskontrollerade bokens namespace och aktuellt/historiskt workerformat. Saknad legacy-bucket tillåts; annan bok, traversal och lagrad URL-fallback avvisas innan signeraren anropas.

Avvikelsen från kriterieformuleringen ”aldrig hämtar bucket ur DB” är avsiktlig: metadata läses för kontroll, inte för val av signeringsbucket. Bedöm den faktiska säkerhetsinvarianten. Råa providerfel/lagringsreferenser loggas inte.

Codex har läst koden och kontrollerat commitblobbarna mot sex verifierade källhashar. Separat skrivskyddad produktionsaggregering visar 13 icke-tomma ljudreferenser, samtliga i tillåtna format. Ingen fil hämtad/signering/uppspelning utförd. **Stäng inte hela S1-02:** DB-skrivskydd, behörig uppspelning och integration/live kvarstår.

## Två tidigare öppna inventeringsfrågor är besvarade

Codex körde read-only SQL mot det befintliga länkade produktionsprojektet den 15 september:

- `chapter-media` är publik och tom.
- `profiles` har två triggers som bara uppdaterar `updated_at`; ingen skyddar `role` eller `demo_mode`.
- Effektiva tabellgrants tillåter fortfarande INSERT/UPDATE/DELETE för `authenticated`. Enbart kolumn-REVOKE tar inte bort den breda tabellrätten. INSERT/återskapande måste också tas med i fixen.
- `ai_jobs_update_own` och de breda ljud-/content-policyerna finns kvar live. Inga ändringar har applicerats.

Bevis: `/Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-GATE-evidence/production-inventory.json` och SQL-/kommandofilerna bredvid. Bekräfta dessa observationer i din rapport; markera ingen rättighetsfix applicerad.

## Därefter E1, inom rätt filgräns

E1/X1 finns ännu i root och saknar isolerad kandidat-SHA. Gör endast read-only integrationsgranskning av den frysta överlämningspatchen och rapporten; applicera inte alla 46 filer. [E1:s filer, underlag och avgränsning finns i dagens status](2026-09-15-launch-status.md#6-nästa-delegation--smala-paket-högst-fyra-samtidigt). Korrektur/godkänn/ångra är E1; kampanj, payout och export är separata X1-paket. Samtidiga rate-limit- och marketinghunkar får inte följa med oavsiktligt.

## Leverans

Lämna en rapport per paket: exakt SHA/bas, filer, kommando/utfall, blockerande fynd med kodbevis och vad som återstår live. Ange ”kodgranskad”, ”lokalt verifierad” och ”liveverifierad” separat. Ändra inte kandidatfilerna. Om du inte kör testerna själv: markera bevisen som granskade loggar, inte som egen testkörning. Du skrev de fem extra root-launchfixarna, så en annan granskare behöver självständigt bedöma just dessa när Codex isolerat dem.
