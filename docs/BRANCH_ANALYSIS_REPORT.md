# Branch-analysrapport – Verkli Web

**Genererad:** 2025-03-03  
**Basbranch:** `origin/mvp` (commit `bfc435c` – fix: performance, accessibility, error handling, rate limiting, tests)  
**Regler:** Inga brancher raderas, ingen force push, ingen historik ändras. Arbeta endast via nya `consolidate/<branch>`-brancher.

---

## 1. Sammanfattning

| Kategori | Antal |
|----------|--------|
| Remote-brancher totalt | 26 |
| Brancher med commits **saknade** i mvp | 10 |
| Brancher redan inkluderade i mvp (0 commits före mvp) | 16 |
| main (production) | 1 (38 commits före mvp – production-historik) |

---

## 2. Brancher med commits som saknas i origin/mvp

Dessa brancher innehåller minst en commit som inte finns i `origin/mvp`. För varje branch listas dessa commits, en kort sammanfattning och en klassificering.

---

### 2.1 `origin/chore/architecture-cleanup`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 1 |
| **Commit(s)** | `8fcdfbf` – chore(repo): remove tracked onnx model file |
| **Sammanfattning** | Tar bort spårad ONNX-modellfil från repot; uppdaterar .gitignore, tar bort `qwen_tts_synthesize.cpython-312.pyc` och ett setup-skript. Minskar repo-storlek och undviker att committa binärer. |
| **Klassificering** | **A. Production relevant** – Repo-hygien, bör in i mvp. |
| **Status** | Rekommenderad åtgärd: skapa `consolidate/chore-architecture-cleanup`, rebase på mvp, lösa konflikter, köra build/tester, öppna PR mot mvp. |
| **Risk** | Låg. Endast borttaget innehåll och .gitignore. |

---

### 2.2 `origin/codex/mvp-notifications-backend`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 1 |
| **Commit(s)** | `063443c` – feat(notifications): add notifications backend |
| **Sammanfattning** | Lägger till notifications-backend: API-routes (GET/PATCH [id], mark-all-read, unread-count), `server.ts`, migration `20260211_notifications.sql`, flags, api-errors, queue-names. |
| **Klassificering** | **D. Duplicate work** – mvp har redan notifications (api/notifications/*, lib/notifications/server.ts, migration). Implementationen i mvp är något annorlunda (t.ex. query-schema, NOTIFICATION_TYPES). |
| **Status** | Överlappar mvp. Ingen consolidate-branch behövs om nuvarande mvp-notifications anses tillräcklig. |
| **Risk** | Låg. Duplikat; kan markeras som safe-to-archive. |

---

### 2.3 `origin/codex/mvp-notifications-backend-src`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 1 |
| **Commit(s)** | `dcb064a` – feat(notifications): add notifications backend |
| **Sammanfattning** | Samma innehåll som codex/mvp-notifications-backend (samma filändringar). Troligen samma feature, annan commit-hash p.g.a. historik-rewrite. |
| **Klassificering** | **D. Duplicate work** – Som ovan; mvp har redan notifications. |
| **Status** | Safe-to-archive. Ingen consolidate behövs. |
| **Risk** | Låg. |

---

### 2.4 `origin/codex/recommendations-translation-api`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 3 |
| **Commit(s)** | `056c02b` – test(api): cover recommendations, genres, onboarding, translations<br>`878cd9d` – feat(api): recommendations, genres, onboarding, translation status<br>`b86e033` – feat(notifications): add notifications backend |
| **Sammanfattning** | Tre lager: (1) notifications backend, (2) API för recommendations/genres/onboarding/translation status, (3) tester för dessa. mvp har redan recommendations/for-you, genres, reader/onboarding. Tester och eventuella extra translation/status-endpoints kan vara värdefulla. |
| **Klassificering** | **B. Feature work** + delvis **D** – Notifications och delar av API överlappar mvp; tester och translation-status kan vara nytt. |
| **Status** | Analysera diff mot mvp: behåll endast det som inte redan finns (t.ex. tester, translation-status). Om något unikt finns → consolidate-branch och selektiv PR. |
| **Risk** | Medel – risk för dubbletter om allt mergas rakt. |

---

### 2.5 `origin/cursor/development-environment-setup-df5d`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 39 |
| **Commit(s)** | Många (t.ex. `449385a` – AGENTS.md med Cursor Cloud-instruktioner; övriga: "text fix mm", "pills ist för dropdown", "edploy error fix", "Establish private access copy and tone", "fixat bättre text för waitlist page", "fixat mouse blob", "fixat bakgrund o färger mm", "fixat numbers för waitlist", "email för waitlist", "chore: bump version to trigger Vercel deploy"). |
| **Sammanfattning** | Blandad historik: en commit med AGENTS.md (Cursor-utvecklingsinstruktioner), många små justeringar (text, waitlist, UI, deploy). Ser ut som experiment/scratch och tidig utveckling. |
| **Klassificering** | **C. AI scratch / experiment** + möjligtvis **B** – AGENTS.md kan vara värd att plocka in manuellt om den skiljer sig från nuvarande; resten scratch. |
| **Status** | **Safe-to-delete** (men radera inte – endast markera). Om AGENTS.md ska in i mvp, gör det via en separat commit på mvp eller en liten consolidate-branch med endast den filen. |
| **Risk** | Låg om inget mergas; medel om hela branchen mergas (mycket brus). |

---

### 2.6 `origin/feat/clubs-polls-newsletters`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 1 |
| **Commit(s)** | `f2220c4` – feat: translation UI panel and API (GET /api/books/[id]/translations, GET /api/books/[id]/translation-status, TranslationPanel, TranslationStatusBadge, LanguageVersionList, integrerat i BookEditor). |
| **Sammanfattning** | Translation UI och API för böcker: list versions + pending, language status + progress, nya komponenter, integrerat i BookEditor. mvp har inte dessa API-routes eller komponenter. |
| **Klassificering** | **B. Feature work** – Tydlig feature med eget API och UI. |
| **Status** | Rekommenderad åtgärd: skapa `consolidate/feat-clubs-polls-newsletters`, rebase på mvp, lösa konflikter, build + tester, PR mot mvp. |
| **Risk** | Medel – ny kod och integration i BookEditor; kräver review. |

---

### 2.7 `origin/feat/notifications-analytics`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 2 |
| **Commit(s)** | `8ea43c2` – feat: recommendations API endpoints (for-you, genres, onboarding)<br>`46ad8cc` – feat: book clubs (migration, API, UI, pages) |
| **Sammanfattning** | Recommendations-API (for-you, genres, onboarding) – mvp har redan liknande. Book clubs är nytt (migration, API, UI, sidor). |
| **Klassificering** | **B. Feature work** + delvis **D** – Recommendations redan i mvp; book clubs är ny feature. |
| **Status** | Skapa consolidate-branch med endast book clubs-ändringar (eller hela branchen om diff visar att recommendations-commits tillför något). Rebase på mvp, konflikthantering, build/tester, PR. |
| **Risk** | Medel – book clubs är större feature. |

---

### 2.8 `origin/feat/reco-translation-ux`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 1 |
| **Commit(s)** | `bba82da` – idfk |
| **Sammanfattning** | En commit med otydligt meddelande ("idfk"); inget beskrivet innehåll. |
| **Klassificering** | **C. AI scratch / experiment** – Troligen experiment eller ofullständig commit. |
| **Status** | **Safe-to-delete** (markera endast; radera inte). Ingen consolidate rekommenderad utan granskning av diff. |
| **Risk** | Låg. |

---

### 2.9 `origin/fix/payments-prod`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 2 |
| **Commit(s)** | `d5cae6c` – feat(payments): harden webhook processing and route coverage<br>`788aa12` – feat(payments): production ready checkout and webhook |
| **Sammanfattning** | Förbättrad webhook-hantering, fler tester (route.test.ts), atomic processing-migration, production-redo checkout och webhook. mvp har redan stripe webhook och relaterade routes. |
| **Klassificering** | **A. Production relevant** – Hardening och production-fokus för betalningar. |
| **Status** | Rekommenderad åtgärd: skapa `consolidate/fix-payments-prod`, rebase på mvp, lösa konflikter, köra build och särskilt webhook-tester, PR mot mvp. |
| **Risk** | Medel – berör betalningar; noggrann review och test krävs. |

---

### 2.10 `origin/main`

| Fält | Värde |
|------|--------|
| **Commits saknade i mvp** | 38 |
| **Sammanfattning** | Production-branch. Innehåller production-historik som mvp ännu inte har. Enligt reglerna: main = production, mvp = aktiv utveckling; ingen force push, ingen radering. |
| **Klassificering** | **A. Production** – Används endast för production. |
| **Status** | Ingen åtgärd – main ska inte rebasas eller konsolideras in i mvp. mvp mergas i main vid release. |
| **Risk** | N/A. |

---

## 3. Brancher utan commits som saknas i mvp (redan inkluderade eller bakom mvp)

Dessa har **0** commits som inte finns i `origin/mvp`. De kan betraktas som antingen mergade in i mvp eller som äldre/bakom mvp.

| Branch | Status | Rekommenderad åtgärd |
|--------|--------|----------------------|
| origin/backup-before-filter | Redan inkluderad / backup | Safe-to-archive |
| origin/claude/competent-shannon | Redan inkluderad | Safe-to-archive |
| origin/claude/dreamy-rubin | Redan inkluderad | Safe-to-archive |
| origin/claude/keen-austin | Redan inkluderad | Safe-to-archive |
| origin/codex/backend-core-author-flow-api | Redan inkluderad | Safe-to-archive |
| origin/codex/mvp-sync-1f2b377 | Redan inkluderad | Safe-to-archive |
| origin/codex/pr1-ai-jobs-minimal | Redan inkluderad | Safe-to-archive |
| origin/codex/pr2-types-api-route | Redan inkluderad | Safe-to-archive |
| origin/competent-lamport | Redan inkluderad | Safe-to-archive |
| origin/dev | Redan inkluderad | Safe-to-archive |
| origin/feat/beta-worker-hardening | Redan inkluderad | Safe-to-archive |
| origin/fix/ci-build-stability | Redan inkluderad | Safe-to-archive |
| origin/gifted-panini | Redan inkluderad | Safe-to-archive |
| origin/mvp-backup-before-cleanup | Backup | Safe-to-archive |
| origin/practical-antonelli | Redan inkluderad | Safe-to-archive |

---

## 4. Rekommenderad åtgärdsmatris

| Branch | Klassificering | Åtgärd | Konsolidera? |
|--------|----------------|--------|--------------|
| chore/architecture-cleanup | A. Production relevant | Skapa consolidate-branch, rebase, PR mot mvp | Ja |
| codex/mvp-notifications-backend | D. Duplicate | Markera safe-to-archive | Nej |
| codex/mvp-notifications-backend-src | D. Duplicate | Markera safe-to-archive | Nej |
| codex/recommendations-translation-api | B + D | Diff mot mvp; ev. consolidate med endast unikt innehåll | Selektivt |
| cursor/development-environment-setup-df5d | C. AI scratch | Markera safe-to-delete (radera inte) | Nej (ev. endast AGENTS.md) |
| feat/clubs-polls-newsletters | B. Feature work | Skapa consolidate-branch, rebase, PR mot mvp | Ja |
| feat/notifications-analytics | B + D | Consolidate book clubs; skippa duplikat recommendations | Ja (selektivt) |
| feat/reco-translation-ux | C. AI scratch | Markera safe-to-delete (radera inte) | Nej |
| fix/payments-prod | A. Production relevant | Skapa consolidate-branch, rebase, PR mot mvp | Ja |
| main | A. Production | Ingen åtgärd | Nej |

---

## 5. Nästa steg (reversibelt, utan force push)

1. **Consolidate-brancher skapas** från respektive branch, rebasade på `origin/mvp` (inga force push på ursprungsbrancher).
2. **Konflikter** löses i consolidate-brancher; build och tester körs i repot.
3. **PR skapas** från `consolidate/<branch>` mot `mvp` för: chore/architecture-cleanup, feat/clubs-polls-newsletters, fix/payments-prod; och selektivt för codex/recommendations-translation-api och feat/notifications-analytics efter diff-analys.
4. **Safe-to-delete/archive** – endast markering i denna rapport; inga brancher raderas.
5. **main** lämnas oförändrad; mvp förblir aktiv utvecklingsbranch.

Vill du att jag skapar de första `consolidate/<branch>`-brancherna (t.ex. för chore/architecture-cleanup, fix/payments-prod, feat/clubs-polls-newsletters) och kör rebase + build/tester härnäst?
