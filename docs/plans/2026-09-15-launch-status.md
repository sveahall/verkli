# Verkli — integrationsstatus, 15 september 2026

Codex äger prioritering, interna agenter, integration och release. Claude är oberoende S1-granskare. Svea beslutar produktvillkor, faktiska köp/API-utgifter och databasändringar som kräver godkännande. Detta dokument ersätter tidigare statuskolumner; äldre bevis finns i Git-historiken och evidensmapparna.

## Aktuellt efter Claudes senaste review

**En samlad kodkandidat finns nu: `b259dc5fe34f3883da4217e0f2982cfa3b6afb03`**, branch `codex/beta-candidate-20260915`, från R0 `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`. Worktree `/Users/admin/verkli-web/.claude/worktrees/beta-candidate-20260915`.

**2 063 enhetstester, full lint, build:ci med TypeScript, språkgrind och 10/10 launch-E2E PASS på samma kandidat.** Next manifesterar middleware på `/`. Launch-E2E kördes på kandidatens produktionsbygge på localhost:3056 med installerad Chrome, dummy-uppgifter och AI-flaggor av. Första browserförsöket stoppade före testkropparna eftersom nedladdad Chromium saknades; loggen är bevarad och ingen dependency installerades.

**Inte driftsatt eller godkänd för beta.** Databasens breda behörigheter är oförändrade. Ingen autentiserad kundresa, verklig worker-/AI-körning, faktisk order eller inboxleverans verifierades i denna våg. Grönt lokalt totalantal stänger inte dessa punkter.

Codex har tagit hand om delegeringen och sammanfört resultaten. Agenterna för R1, storage-uppföljning och E1-extraktion är klara; två av dem gjorde därefter oberoende korsgranskning av andras ändringar. Inga nya Cursor/Grok-uppdrag behövs. Ingen obeställd bakgrundsövervakning eller extern meddelandesändning är startad.

## Paketen

| Paket | Fryst käll-SHA | Status |
|---|---|---|
| R0 | `e9544c19bbd23601070aa9bbbb67ce12b5169bd6` | Redan säkrat/pushat på egen granskningsgren; utgör kandidatens bas. |
| F1 | `3372782c2da4516ca80f40de7e6caeb60fddaf91` | Integrerat: importstatusåterhämtning/dubbelsläpp, prisutkast, etikett/typografi. |
| S1-GATE | `f9e53d8c3db4bfd15927f435c58fe618893ceb4f` | Claude PASS med fyra icke-blockerande fynd. Integrerat. Fullständiga fyra fynd återges inte i senaste bifogade rapporten; F3 om publiceringsbokväljaren är känd. |
| S1-STORAGE | `717a98eaedebddb6d70037263a339aab168d50a5` | Claude PASS på kodförsvaret; 143/143 oberoende reproducerade. Integrerat. Detta är korrekt 40-teckens-SHA. Använd `red-final.log` (84 fail/52 pass), inte tidigare `red.log`. |
| Storage-uppföljning | `428a3a8e0bfeead953da23545d98f54841a28c54` | Claudes M1/M2 åtgärdade: play + workspace skyddade, play även kapitelbundet, inga lagringsreferenser i signeringsloggar. Oberoende review 0 P1/P2 och 195/195 tester. Integrerat. |
| R1 limiter | `778c5f93f3bc0b41c13be2e2d8e02e86004b2339` | 43 filers granskad extraktion; 41 instanser i 40 befintliga callers, separata Redis-namn. 10/10 riktade tester, RED fångar gamla kollisionen. Integrerat. |
| R2 launchfixar | `266667235e57b9913eca616cc4424be7cd5ad36d` | Fem filer: build:ci/launch-alias, rätt betaindikator, språkgrind med exakt fyra tillåtna boksträngar. 6/6 tester och oberoende review 0 P1/P2. Integrerat. |
| E1 korrektur | `c7cc926f3d1c2dea0588f1a903765ebb90fea0d0` | 14 filer isolerade, 56/56 riktade tester + typer/lint. X1-marketinghunk och gamla layout/ARIA-återgångar uteslutna. **Inte integrerat eller releasegodkänt**; se nedan. |
| AI-översättningskedja | `74aa9075b8a59550be78173ee827b637d8a8896f` | 43 filer säkrade som WIP på annan bas (`61c833da`). Tidigare 134 riktade tester/offlinefall; känd sparningsrisk, ingen riktig providerresa. Inte integrerat. |
| S1-DB | `bee4a27bf6554f14c423831bb5d4c956cb8ddb8d` | Sex förslags-/testfiler, 56/56 lokal PG14 och oberoende Codex-review. Inte migration/applicerat; Claudes DB-review och Sveas beslut återstår. |
| X1 | Dirty root + överlämnad patch | Kampanj/payout/export och onboarding-redirect hålls utanför denna beta-kandidat. |

75 filer ändrade i samlad kandidat jämfört med R0, varav historiska S1-review/triage-dokument ingår från S1-GATE. Inga produktfiler eller index i dirty root har ändrats av extraktionen. Källhashmanifest och hunkgranskning säkrar ursprunget; inga masskopieringar av rootdiffen. Dependencies återanvändes via APFS-kloner av verifierade lokala träd; inga paket installerades. Vanliga commits/cherry-picks användes utan hookbypass; worktree saknar den konfigurerade Husky-wrappern, varför explicita tester är bevisen.

## E1: extraktionshindret är löst, lanseringskontrollen återstår

Den blandade `BookEditorPanelContent.tsx` extraherades per hunk: endast ApplyReview-import, callbacks/props och ReviewPanel-forwarding. Marketing-callback, containerlayout, BookEditorView-ARIA och ReviewPanels container queries hålls identiska med R0. Övriga E1-filer ägs av samma paket.

Nästa E1-fix måste hantera:

- Provideranropets feature-/kostnadsspärr och budget-/usage-registrering. Den extraherade routen har ägarskap och rate limiting, men detta är inte en kostnadsbudget.
- Säkert samspel mellan review-apply och autosave/navigering, inklusive fel/retry och nyare text; `updated_at`-CAS förutsätter korrekt trigger och RLS i verklig DB.
- Undo håller rå JSON som nästa expected-värde medan sparningen normaliserar JSON; icke-kanoniska ursprungsvärden kan ge onödigt stale-avslag.
- Konfigurerad provider/modell och ett verkligt kvalitetstest, inom godkänd budget. Nuvarande unit använder providerstubbar.

Vid senare R1-integration måste routens limiter få `name: "editorial-review"`; den frysta E1-kandidaten har R0-kontraktet. Ingen flaggändring eller providerresa gjordes nu.

## S1: produktionsblockerarna

Senaste read-only liveinventering ligger i S1-DB-evidence/prechange-catalog.json (2026-09-15T12:10:07Z), PostgreSQL17.6. Anon/authenticated har breda grants på profiles/ai_jobs/audiobook_assets/chapter_audio_cache. RLS är aktiv men ersätter inte borttagna tabellprivilegier. Profilens auth-trigger litar på användarstyrd role-metadata. Två breda Storage-SELECT-policyer ger inloggade läsning trots privata bucketflaggor. Inga live-rader eller behörigheter ändrade.

| Blockerare | Nästa faktiska stängningsbevis |
|---|---|
| S1-00 profilroll/demo | Godkänt SQL, låst admin-onboarding, färska effektiva ACL/triggerkontroller och riktig ny författarresa. |
| S1-01 releasegrind | Granskad kod integrerad; kör konfigurerad grind på slutlig miljö. Versionens published_at ska styra bokväljaren. |
| S1-02 signering | Kodförsvaret integrerat inklusive två återstående sinks; DB-skrivskydd och behörig uppspelning återstår. |
| S1-03 bred Storage-läsning | Godkänt SQL, faktisk policy/GRANT-efterkontroll samt Storage HTTP-prov som tillåten och otillåten läsare. |
| S1-04 importintegritet | Framkalla del-/upsertfel och jämför kapitelantal + exakt innehåll före/efter. |
| S1-05 översättningssparning | Atomiskt skydd av befintlig/nyare måltext och verklig avbrottsreproduktion. |
| S1-06 autosave | Offline→online utan ny tangenttryckning, navigering/debounce/retry; samordna samma writer med E1. |
| S1-07 ljudavbrott | Köat/pågående jobb, återläs cancel och låt inte checkpoint skriva över avbrottet. |

Ingen är stängd i produktion. Storage M3 är en driftregel: byte av konfigurerad bucket kräver verifierad privat bucket och migrerade objekt/referenser; avvisning får inte lösas med godtycklig DB-bucket eller URL-fallback. Worker-cacheläsning och hela live-cacheformatinventeringen återstår som separat yta. `books.status/books.published` kontra `book_versions.published_at` i bokväljare och assetpolicy behöver ett separat litet paket.

## Beslut som ligger hos Svea

1. **S1-DB-förslaget:** konkret underlag `/Users/admin/Documents/Verkli/Lansering-2026-09-15/S1-DB-evidence/S1-DB-forslag.md`. Nyregistrering ska börja som reader, befintligt adminflöde ger author + beta manuellt. Godkännande krävs enligt projektets instruktion om schemaändringar; inget svar har ännu registrerats. Claude har ännu inte granskat detta DB-paket. Ingen automatisk rollback till osäkra grants.
2. **PRO-löftet:** rekommendation tidsbegränsat PRO för inbjudna med tydliga AI-tak; alternativt ändra inbjudningsmailet. Inget beslut eller ny grant. Beta-flaggan ger inte PRO.
3. **Verkliga prov:** 5 000 SEK är budgetplanering, inte utförda köp. Namngivna konton/inbox/testmiljö, kort providerprov och eventuell 75-kronorsorder måste låsas. Inga sådana kostnader här.

R0 innehåller mailretryfix; faktisk leverans/idempotens saknar livebevis. Permanent checkout-bärarlänk, regression för success-sidans expandPayment och återställning efter vunnen tvist kvarstår. Säkerhets-/åtkomstbrister går före nya avatar- eller designprojekt.

## Bevis och nästa överlämning

Alla bevis ligger under `/Users/admin/Documents/Verkli/Lansering-2026-09-15/`:

- `Combined-candidate-evidence/REPORT.md`, `candidate-manifest.json`, `candidate.diff`, `diffs/` samt kommandon/loggar för full unit/lint/build/launch-E2E.
- `R1-extraction-evidence/README.md`, exakta 43 filhashar och diffar.
- `R2-extraction-evidence/REPORT.md`, RED-original/RED-broad/GREEN samt `INDEPENDENT-REVIEW.md`.
- `S1-STORAGE-followup-evidence/README.md` och `INDEPENDENT-REVIEW.md`.
- `E1-extraction-evidence/REPORT.md`, `extraction-decisions.md`, `LAUNCH-REVIEW-ITEMS.md` och fryst filvis diff.
- `S1-DB-evidence/S1-DB-forslag.md`, kandidat/rollbackbevis och read-only driftkatalog.

Nästa separata granskaruppdrag är S1-DB och E1:s isolering/öppna lanseringspunkter. Färdig brief: `docs/plans/2026-09-15-claude-followup-review.md`. Den är förberedd men inte skickad av Codex. Svea behöver inte delegera fler koduppdrag: Codex äger åtgärderna och deras ordning.

## QA vid integration och release

1. Matcha HEAD/filhashar mot manifest och läs diffarna för just kandidaten.
2. Kör full unit/lint/build:ci; kontrollera middlewaremanifest `/` och TypeScript.
3. Starta samma produktionsbygge på localhost med dokumenterad dummy-miljö; kör launch-E2E. Första vågens tio publika/negativa fall ska passera.
4. Verifiera F1 med utvecklingsfixturen och sedan godkända autentiserade konton; jämför importstatus, pris och omslags-/ljudstatus efter reload.
5. Efter särskilt godkänt SQL: jämför effektiva ACL, triggers, alla policyer och faktisk Storage-åtkomst. En skriven migration är inget appliceringsbevis.
6. Kör en hel författar- och läsarresa på samma SHA och DB-tillstånd: inbjudan→login→import→spara/reload→översättning→ljud→behörig läsare, plus separat köp/inbox. Inga kritiska skips bakom grönt totalantal.
