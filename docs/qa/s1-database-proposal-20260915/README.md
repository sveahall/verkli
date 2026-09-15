# S1-DB — förslag för godkännande, 15 september 2026

**Status: endast förslag. Inte applicerat, inte en canonical Supabase-migration och inte ett produktionsbevis.**

Bas: R0 `e9544c19bbd23601070aa9bbbb67ce12b5169bd6`. Arbetsgren: `codex/s1-database-hardening-20260915`. De frysta S1-GATE- och S1-STORAGE-kandidaterna som Claude granskar har inte ändrats.

## Vad beslutet gäller

Godkänn i så fall den exakta filen `hardening.sql`, en samlad transaktion, mot projekt `glfipbnsyxowqsmcuzcm`, **efter oberoende review, färsk kontroll av drift och förberedd onboarding**. Inga nya tabeller, kolumner, beroenden eller ändrade kundrader ingår. Behörigheter, sex policyer och registreringens triggerfunktion ändras. `NOTIFY pgrst` uppdaterar schema-cachen efter commit.

| Yta | Föreslagen ändring | Tillåtet flöde som bevaras |
|---|---|---|
| `profiles` | Ta bort breda klientgrants och eventuella kolumngrants. Ge `authenticated` INSERT/UPDATE på 13 namngivna profilfält. Skydda `role`, `demo_mode`, `is_protected`, tidsstämplar och sökvektor. Neka direkt DELETE/återskapande och TRUNCATE. | Profil/avatar/omslag, läsinställningar, onboarding, ålderskontroll och begäran om kontoborttagning. Befintlig ägar-RLS gäller fortfarande. |
| Registrering | `handle_new_profile()` skapar alltid `reader`; fast tom `search_path`, kvalificerad tabell. Inga befintliga roller ändras och de två befintliga triggerkopplingarna behålls. | Namn/avatar kopieras som data. Serverns adminflöde kan fortfarande ge author/demo. |
| `ai_jobs`, `audiobook_assets` | Ta bort klienternas INSERT/UPDATE och farliga tabellgrants. Ta bort de tre gamla skrivpolicyerna. | SELECT med befintlig RLS. Authenticated own-DELETE behålls; browserns kapitelstädning använder det för jobb. Server/worker-rättigheter ändras inte. |
| `chapter_audio_cache` | Ersätt breda klientgrants med SELECT. | Befintlig own-SELECT-policy och service-role-skrivningar. Den gamla RLS:en blockerade redan klientrader vid write; detta stänger även grant-/TRUNCATE-ytan. |
| Storage | Ta bort de två SELECT-policyerna som ger alla inloggade läsning av `audiobooks`, `tts-outputs` och `content-assets`. | Serverns signerade åtkomst efter bok-/köparbehörighet. Övriga bucketpolicyer och service-role-grants ändras inte. |

### Onboarding måste ingå i beslutet

Det nyupptäckta problemet är att registreringstriggern litar på `auth.users.raw_user_meta_data.role`, vilket registreraren själv anger. Den kan därför ge `author` via `author` eller `writer` utan adminbeslut. Att endast låsa `profiles.role` räcker inte.

Efter fixen börjar nya konton som läsare. För den första lilla betan föreslås **befintligt manuellt admin-godkännande av författarrollen**, dessutom beta-access, innan författaren ska använda studion. `grantBetaAccessIfInvited()` i `apps/web/src/lib/auth/beta.ts:233` sätter bara `user_flags.beta_enabled`; det ger inte author eller PRO. Den gamla signup-koden skickar metadata `author`, vilket inte längre ska ge privilegier. Kodvägen för admin finns redan i `api/admin/users/route.ts` och godkännande av `author_applications` i `api/admin/author-applications/route.ts:123`.

**Innan SQL får appliceras:** lås vem som gör det manuella godkännandet och verifiera den riktiga nya författarresan. Om inbjudan måste ge author helt automatiskt behövs ett separat serverpaket med betrodd författar-inbjudan, verifierad e-post och tester. En offentlig waitlist-roll eller godtycklig användarmetadata ska inte bli en behörighetskälla. Ingen sådan ny auto-grant ingår här. PRO-beslutet är separat och fortfarande öppet.

## Underlag och omfattning

Read-only livekatalog från 15 september: `S1-GATE-evidence/production-inventory.json` (06:02:33Z) och `S1-DB-evidence/compatibility-inventory.json`, under `/Users/admin/Documents/Verkli/Lansering-2026-09-15/`. Den senare visar PostgreSQL 17.6, breda grants inklusive MAINTAIN, inga klientkolumn-ACL eller rollmedlemskap och de två auth-triggerkopplingarna. Det nya read-only `postcheck.sql` kördes även mot PG17.6 den 15 september 12:10:07Z (`prechange-catalog.json`): anon/authenticated saknar BYPASSRLS och ärvda roller, service_role har BYPASSRLS, och alla åtta klientkombinationer har fortfarande MAINTAIN före åtgärd. Inga användarrader, manus, ljudfiler eller tokens hämtades; ingen live-exploit eller mutation kördes.

`storage-access-map.md` i samma bevismapp dokumenterar alla hittade jobb-/assetmutationer och deras klienttyp. Ingen legitim browser/cookie INSERT/UPDATE till jobb/assets hittades. Profilflödenas tillåtna fält finns bland annat i:

- `apps/web/src/features/author/settings/actions.ts`: avatar, omslag, profil och inställningar via cookie-klient; behöver kolumngrants trots att filen kör på servern.
- `apps/web/src/features/auth/roles.ts`: `preferences`, ingen legitim klientändring av auktoritativ roll.
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ReaderChapterClient.tsx`: browser-upsert av läsinställningar.
- `api/reader/settings`, `api/reader/onboarding`, `api/reader/age-verify`, `api/reader/preferences/preferred-language` och `api/account/delete`: motsvarande tillåtna profilfält.

`fixture.sql` innehåller en **minimal syntetisk datamodell** med dagens relevanta policy- och triggerdefinitioner, inklusive alla 25 storagepolicyer. Den är inte en komplett Supabase-kopia. Storage-fixturen använder syntetiska ALL-grants; proven visar RLS-policyernas effekt men ersätter inte effektiv grant-kontroll och HTTP-prov mot riktig Supabase Storage. Existerande roller och funktionernas runtime-behörigheter testas genom PostgreSQL, inte genom mocks.

## Lokalt bevis och reproduktion

Ingen installation behövs. Den redan installerade PostgreSQL 14.18 används med Python-standardbiblioteket. Köraren skapar en ny datakatalog under `/tmp`, en privat Unix-socket med 0700, `listen_addresses=''`, avvisade hostanslutningar och inga ärvda PG-/Supabase-uppgifter. Den accepterar ingen databas-URL och stänger/rensar sin egen databas efter körning.

Från detta worktrees rot:

```sh
python3 docs/qa/s1-database-proposal-20260915/verify-local.py --baseline
python3 docs/qa/s1-database-proposal-20260915/verify-local.py
python3 docs/qa/s1-database-proposal-20260915/verify-local.py --rollback
```

Första körningen mot gamla behörigheter: **22 pass / 34 fail, exit 1**. Kandidaten: **56 pass / 0 fail, exit 0**. Återställningskörningen ska ge exakt samma misslyckade säkerhetskontroller som baseline — det bevisar att testerna fångar återinförda problem, inte att återställningen är säker. Alla fel är inte separata exploateringar; exempelvis kan RLS ge noll uppdaterade rader där testet kräver ett uttryckligt grant-avslag.

Testerna täcker metadata-roll, INSERT/UPDATE för varje skyddat profilfält, DELETE/TRUNCATE, profil-upserts inklusive oförändrad author-roll, annan användares profil, adminens rollgrant, jobb-/asset-/cacheuppdateringar, asset-upsert, own-SELECT/DELETE, nekad främmande storage-SELECT och bibehållen serveråtkomst/omslagsläsning. Kandidatens exakta SQL-kropp körs inuti en explicit transaktion; `postcheck.sql` parsas och körs på samma fixture.

**Begränsningar:** lokal PG14 är inte produktionens PG17. Testköraren innehåller MAINTAIN-kontroller för PG17+ men de har inte körts på PG14. `REVOKE ALL PRIVILEGES` omfattar respektive servers privilegier; färskt PG17-katalogbevis krävs efter godkänd applicering. Inga PostgREST-upserts, Supabase Storage HTTP-anrop, riktiga nya konton, UI-resor, köp eller uppspelningar har körts. Appens lint/TypeScript/unit/build har inte körts om för detta fristående SQL-/dokumentförslag och påstås inte vara verifierade av dessa 56 tester.

## Applicering, efterkontroll och återställning

Detta dokument ger ingen egen behörighet att ändra produktion. Användarens projektinstruktion kräver godkännande före schemaändringar; samma kontroll används här för säkerhets-DDL. Inte ens en mutation i en planerad live-ROLLBACK-transaktion ska köras innan beslut.

1. Oberoende reviewer kontrollerar kandidat-SHA, varje fildiff, RED/GREEN, tillåtna fält och onboardingkonsekvens. Stäm av ny livekatalog mot snapshot, inklusive triggerdefinitioner, ärvda roller, kolumngrants och **alla** storagepolicyer. Drift eller ny konsument kräver uppdaterat förslag; ignorera inte avvikelsen.
2. Efter konkret godkännande: flytta exakt godkänd SQL till canonical migration enligt repots migrationsrutin. Kör med behörig operatör i en uttrycklig transaktion; ha kort `lock_timeout`/`statement_timeout`, kör `postcheck.sql` före COMMIT. Vid fel eller oväntat resultat: ROLLBACK. Ingen automatisk fallback till gamla osäkra grants.
3. Efter COMMIT: kör samma `postcheck.sql` genom en **ny anslutning**. Kontrollera effektiv INSERT/UPDATE för samtliga kolumner, borttagna farliga tabellgrants inklusive MAINTAIN, sex borttagna policyer, bibehållen service-role, RLS och trigger som alltid skapar reader. Spara kommando, tidsstämpel och utfall — en migrationsfil eller lokal testlogg är inte bevis på applicering.
4. Vid incident efter commit: föredra åtkomstbegränsning och framåtriktad fix. `rollback.sql` återställer just snapshotens grants, sex policyer och osäkra trigger. Det **öppnar hålen igen**, kräver ett separat incidentbeslut och får inte köras automatiskt. Det reverserar inte användares senare legitima ändringar eller rader. Efter återställning ska katalogen jämföras med aktuell verklighet, inte bara den historiska snapshoten.

## QA efter beslut — sex steg

1. Nytt testkonto med metadata `author` respektive `writer` ska få reader; admin godkänner sedan author och beta. Logga in på localhost mot fastställd testmiljö; kontrollera att studion nås och att befintlig author inte förlorat rollen.
2. Via äkta Supabase-session: spara profil/avatar/omslag, läsarinställningar och onboarding. Reload ska bevara allt. Explicit egen `role`/`demo_mode`-INSERT/UPDATE samt profil-DELETE ska nekas.
3. Två testförfattare: ändring eller upsert av den andras profil/jobbreferens/asset ska nekas. Räkna och jämför provrader före/efter, använd enbart avtalade fixtures.
4. Starta ett avtalat jobb, läs status, pausa/avbryt och kontrollera server/worker-write. Ingen ny betald providerkörning följer av denna QA-lista utan separat budgeterat prov.
5. Behörig läsare spelar ett befintligt testljud via appens route; obehörig får avslag. Direkt lista/download/sign för främmande privat ljud ska nekas med användarsession. Kontrollera samtidigt omslagsbilder.
6. Spara ovanstående mot **samma integrations-SHA och applicerade DB-tillstånd**. Claude granskar bevisen. Markera inte S1-00/02/03 stängda innan både kod och verklig åtkomst är verifierade.

## Fortfarande öppet utanför detta paket

- Workspace-loadern `loadBookWorkspaceData.ts:169–181` signerar fortfarande rå assetpath utanför de tre frysta S1-STORAGE-routarna. Den behöver separat kodförsvar; redan inplanterade referenser blir inte rena av ett REVOKE. Tidigare aggregering visar 13 befintliga icke-tomma asset/jobbpaths i tillåtna bokformat, men det är inte all framtida data.
- `audiobook/play` och workern litar på `chapter_audio_cache.audio_path`; metadata visar inga klient-write-policyer, men befintligt cacheinnehåll är inte inventerat här. Serverreferenser ska också valideras.
- `chapter-media` är publik, med noll objekt i snapshoten. Framtida manusbilder kräver ett separat privat åtkomstflöde. Bucketen ändras inte här.
- Äldre `content-assets`-URL:er och externa konsumenter är inte verifierade. Borttagning av SELECT kan också stoppa gamla owner-update/delete-flöden som kräver läsning. Ingen sådan aktiv klient hittades i den granskade koden.
- Redan utfärdade signerade länkar kan fungera till sin TTL; en policyändring återkallar dem inte automatiskt.
- S1-04/05/06/07 (import, översättningssparning, autosave, ljudavbrott) och integration/hel kundresa kvarstår.
