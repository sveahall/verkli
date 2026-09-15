# Nästa oberoende review — S1-DB och isolerat E1

Du är read-only granskare. Ändra inga produktfiler, kandidater, SQL/behörigheter eller externa konton. Lägg rapporten i `/Users/admin/Documents/Verkli/Lansering-2026-09-15/Claude-followup-review.md`. Inga provideranrop, utskick eller köp. Codex äger alla fixar och integration; granskaren skriver inte implementationen.

Ditt förra besked har hanterats: S1-GATE och S1-STORAGE ingår med F1/R1/R2 i samlad kandidat `b259dc5fe34f3883da4217e0f2982cfa3b6afb03`. M1/M2 tillägg `428a3a8e0bfeead953da23545d98f54841a28c54` täcker även play/workspace och loggar; intern oberoende review 0 P1/P2, 195/195 PASS. Full kandidat har 2063 unit/lint/typer/build:ci och 10/10 lokal launch-E2E PASS. Inget live-/DB-godkännande följer av detta. Korrekt original-storage-SHA är `717a98eaedebddb6d70037263a339aab168d50a5`; levererad RED heter red-final.log.

## 1. S1-DB — prioritet

Fryst kandidat `bee4a27bf6554f14c423831bb5d4c956cb8ddb8d`, parent R0 `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`. Worktree `/Users/admin/verkli-web/.claude/worktrees/s1-database-hardening-20260915`; endast sex filer i docs/qa/s1-database-proposal-20260915. Läs filvis diff och `S1-DB-evidence/S1-DB-forslag.md` under evidensbasen ovan.

Kontrollera effektiva table/column/ärvda grants (REVOKE på en kolumn räcker inte), auth-triggerns opålitliga metadata, sex borttagna policyer, 13 legitima profilkolumner, preserved server/service-role och egna select/delete-flöden. Säkerställ konsekvensen: nya konton reader, admin ger author och beta separat; befintliga roller ska inte ändras. Respektera att beslut saknas.

Lokala PG14.18-kontroller är 56/56; baseline och rollback 22pass/34fail. Du kan läsa dessa bevis eller köra den isolerade verify-local.py mot syntetisk databas; kör inga muterande SQL-kommandon mot Supabase, inte ens med planerad ROLLBACK. PG17.6 read-only katalog med MAINTAIN finns i S1-DB-evidence/prechange-catalog.json. PG14 bevisar inte PG17-privilegier, PostgREST-upsert, Storage HTTP eller riktig onboarding. Ange exakt vad som återstår före godkännande/applicering, inte bara PASS på SQL-texten.

## 2. E1 — extraktion verifierbar, ej releasegodkänd

Fryst kandidat `c7cc926f3d1c2dea0588f1a903765ebb90fea0d0`, parent R0. Worktree `/Users/admin/verkli-web/.claude/worktrees/editorial-extraction-20260915`. Evidence: E1-extraction-evidence/{REPORT.md,candidate.diff,candidate-sha256.json,extraction-decisions.md,LAUNCH-REVIEW-ITEMS.md}.

14 filer, 56 riktade tester + typer/lint PASS. Din blockerande marketinghunk uteslöts. Dessutom uteslöts äldre container/layout/ARIA-ändringar. Bekräfta faktisk diff per hunk, inte hela filkopior. Kandidaten använder R0-limiter utan name; senare integration ska lägga till `editorial-review`.

Kända öppna lanseringspunkter: provider-feature-/budgetspärr och usagebokföring saknas; verklig providerrespons/modell inte verifierad; DB timestamp-CAS, autosave/navigering och undo-serialisering kräver åtgärd/prov. Codex har därför lämnat E1 utanför samlad releasekandidat. Granska separation, dataåtkomst, skrivskydd/undo och LLM-gränser; inget behov att köra betalda prov nu. Rapportera nya konkreta fynd utöver de redan dokumenterade.

## Leverera

Kandidat-SHA, exakta fil/rad-hänvisningar, observation/reproduktion, minsta fix, bevisform och stängningskriterium per fynd. Skilj egen körning från lästa loggar och antaganden. Påstå inte att SQL är applicerad eller hela kundresan grön. Uppdatera också gärna fullständiga fyra icke-blockerande S1-01-fynd om de endast finns i din tidigare kontext.
