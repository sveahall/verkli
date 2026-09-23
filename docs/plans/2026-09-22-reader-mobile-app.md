# Verkli Reader – plan för iOS och Android

Datum: 2026-09-22. Status: planförslag, ingen app implementerad.

Användarens beslut: mobilappen omfattar läsardelen. Författarverktygen kommer senare.
Rekommendation: React Native med Expo och TypeScript, som ett eget workspace i samma repo.
Betalningsantagande i grundplanen: gratisinnehåll och befintlig köpt/abonnerad tillgång först. Frågan om köp från start är ännu obesvarad; alternativet finns i etapp 6B.

## 1. Projektgräns och arkitektur

Skapa `apps/mobile` med eget paketnamn `@verkli/mobile`, egen appkonfiguration, versionsnummer, byggprofiler och releaseflöde. Använd samma produktkonton, Supabase-databas, lagring och backend som webben, separerat per test-/produktionsmiljö. Ingen separat produktdatabas behövs för mobilappen.

```text
apps/web       Next.js-webb och befintliga server-API:er
apps/mobile    Expo-app med iOS- och Androidbyggen
apps/worker    Befintliga bakgrundsjobb
packages/shared Gemensamma plattformsoberoende typer och validering
```

Detta ger en separat app utan att dela upp produktens källkod i två Git-repon. Npm-workspaces finns redan i rotens `package.json`. Ett separat repo blir aktuellt först vid en konkret organisations- eller åtkomstgräns, exempelvis ett externt mobilteam som inte ska se backendkoden.

Appen använder Supabase Auth för identitet och server-API:er för bibliotek, innehåll, åtkomst och användardata. Mobilanrop skickar verifierbara åtkomsttoken; servern återanvänder befintliga rättighetskontroller. Webbens cookieflöde behålls. API:erna måste vara bakåtkompatibla eftersom installerade appar uppdateras senare än servern.

Återanvänd data, affärsregler, rena typer och utvalda hjälpfunktioner. Bygg navigation, listor, spelare och kontoskärmar för React Native. Importera inte Next.js-sidor eller serverkod i mobilpaketet. `packages/shared` ska inte få beroenden till Next, DOM eller administratörsklienter.

Expo och React Native kräver nya beroenden. Lista och godkänn dessa före installation enligt projektets instruktioner. Samma gäller eventuella schemaändringar. Planen godkänner inte installation, migrationer, externa kontoköp eller publicering.

## 2. Första versionens omfattning

### Ingår i grundplanen

- Hem med fortsätt läsa/lyssna och länkar till biblioteket.
- Upptäck och sök böcker, filtrera på relevanta befintliga språk/genrer/format.
- Boksida med omslag, beskrivning, författare, kapitel och tydlig åtkomststatus.
- Bibliotek med pågående, köpta, sparade och färdiglästa böcker.
- Kapitelvis läsning med justerbar text, radavstånd och ljus/mörk/sepia.
- Sparade böcker och läsprogress enligt webbens befintliga modell.
- Strömmad ljudbok, hastighet, sovtimer, sparad position, bakgrundsljud och låsskärmskontroller.
- Nedladdade textkapitel och lokal läsning utan uppkoppling.
- Konto, relevanta läsarinställningar, lösenordsåterställning, support och kontoradering.
- Befintliga konton fungerar; eventuell författarroll ger ingen författarnavigation i appen.
- Svenska och engelska gränssnitt med befintlig standard/default som utgångspunkt.
- Tydliga tomma vyer, laddning, fel, åtkomstbegränsningar och återförsök.

### Senare läsaretapper

- Nedladdade ljudböcker med lagringshantering och rättighetsregler.
- Textmarkeringar och anteckningar med kompatibla textankare mellan webb och app.
- Pushnotiser, bokklubbar, inkorg, omröstningar, recensioner och kommentarer.
- Mer avancerad surfplattelayout. Första versionen ska fungera på större skärmar men optimeras för telefon.

Författarstudio, AI-skrivverktyg, import, publicering och utbetalningar ligger utanför denna plan.

## 3. Fas 0 – dokumentation och tekniskt underlag

Denna granskning har inventerat kod och officiell dokumentation. Den ersätter inte körning på fysiska enheter. Verifiera kompatibla SDK-/React-/Node-versioner när implementationen börjar; lås därefter exakta versioner i lockfilen.

### Verifierade kodkällor

| Källa i repot | Vad den visar och hur den används |
| --- | --- |
| `package.json` och `apps/web/package.json` | Npm-workspaces, befintliga React-versioner och webbens skript. Kontrollera beroendeupplösning innan Expo läggs till. |
| `apps/web/src/components/reader/ReaderAppShell.tsx` | Befintlig läsarnavigation och mobil bottenrad; referens för struktur och copy. |
| `apps/web/src/features/reader/` | Hem, upptäck, bibliotek, bok och läsvy; använd som produktreferens. |
| `apps/web/src/app/(app-reader)/reader/library/page.tsx` | Serverhämtat bibliotek med olika hyllor och åtkomst till köpta böcker; behöver exponeras för appen. |
| `apps/web/src/lib/supabase/server.ts` | Cookiebaserad serverklient; mobilens tokenflöde finns inte i denna hjälpare. |
| `apps/web/src/lib/supabase/auth.ts` och `apps/web/src/app/auth/callback/route.ts` | E-post/lösenord, Google och webblänkar för auth. |
| `apps/web/src/lib/books/access.ts` | `getReadAccess(...)` och `canUserReadBook(...)`; granska och återanvänd serverns regler för rätt innehållsnivå. |
| `apps/web/src/app/api/books/[id]/audiobook/play/route.ts` | `GET`, kapitelfråga och signerad ljud-URL med 15 minuters TTL. |
| `apps/web/src/app/api/books/[id]/audiobook/progress/route.ts` | Sparad lyssningsposition och händelser; skiljer senaste position från framsteg. |
| `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ReadingProgress.tsx` | Läsprogress skrivs idag från webbklienten och ska inte gå bakåt. |
| `apps/web/src/app/api/offline/books/[id]/manifest/route.ts` och `chapters/route.ts` | Manifest och kapitelbatch; befintligt format inkluderar bokversion och innehållshash. |
| `apps/web/src/lib/offline/idb.ts`, `types.ts`, `server.ts` och `apps/web/public/sw.js` | Webblagring, kontrakt och offlineåtkomst. Återanvänd kontrakten, inte service worker/IndexedDB som applagring. |
| `apps/web/src/app/api/reader/settings/route.ts`, `api/bookmarks/route.ts`, `api/account/delete/route.ts` | Befintliga inställningar, sparade böcker och kontoradering. |
| `packages/shared/src/contracts/index.ts` | Generella DTO:er finns, men täcker inte hela mobilens läsarbehov. |

### Officiella mönster att använda

- [Expo monorepos](https://docs.expo.dev/guides/monorepos/): npm-workspaces och Metro-konfiguration. Följ aktuell guide i stället för att kopiera äldre manuella resolverlösningar.
- [EAS i monorepon](https://docs.expo.dev/build-reference/build-with-monorepos/): kör EAS från appens katalog och placera dess `eas.json` i `apps/mobile`.
- [Supabase React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native): klientinitiering och tokenförnyelse kopplad till appens livscykel.
- [Supabase native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking): auth-redirect och återgång till appen. Välj ett sammanhängande dokumenterat flöde.
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/): `useAudioPlayer`, `setAudioModeAsync` och `setActiveForLockScreen`. Läs avsnitten för bakgrundsljud på båda systemen.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) och [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): lokala bokdata, eventuella filer respektive känsliga sessionsvärden.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/): testa de verkliga nativefunktionerna i egna utvecklingsbyggen.
- [EAS Build](https://docs.expo.dev/build/introduction/) och [appbutiksinlämning](https://docs.expo.dev/deploy/submit-to-app-stores/): separata byggprofiler, signering och distributionsspår.
- [Apples granskningsregler](https://developer.apple.com/app-store/review/guidelines/), [reader apps](https://developer.apple.com/support/reader-apps/) och [Google Play Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en): konto-, innehålls- och betalningsupplägg måste passa valda lanseringsmarknader.

Verifiering före nästa fas: dokumentera SDK-val, föreslagna beroenden, målmarknader, inloggningsval, faktisk testmiljö och betalningsspår. Bekräfta befintliga rättigheter för gratisbok, helboksköp, kapitelköp och abonnemang med testkonton. Hitta inte på nya schemafält eller anta att alla befintliga routes accepterar Bearer-token.

Dokumenterade API-mönster att utgå från vid implementation: Supabase `createClient` med `persistSession`, `autoRefreshToken` och `detectSessionInUrl: false`; en livscykellyssnare som använder `startAutoRefresh()`/`stopAutoRefresh()`. Auth-guidens `makeRedirectUri()` och `WebBrowser.openAuthSessionAsync` används tillsammans med vald callbackmodell. Följ inte token-callbackexempel och PKCE-exempel samtidigt. SQLite erbjuder `SQLiteProvider`, `useSQLiteContext` och parameteriserad `runAsync`; filguiden visar `File`, `Directory` och `Paths.document`. SecureStore-adaptern måste testas även med stora sessionsvärden, eftersom plattformarnas lagring kan avvisa stora värden. Dessa namn är dokumentationsunderlag, inte en färdig eller installerad integration.

## 4. Fas 1 – körbar mobilupplevelse och ett riktigt bokflöde

Ungefär 3–5 arbetsdagar. Syfte: en demo på telefon och tidigt svar på de tekniska riskerna.

Implementera efter beroendebeslut:

1. Skapa `apps/mobile` från den då dokumenterade Expo/TypeScript-mallen med Expo Router. Lägg appens egen konfiguration och byggprofiler här.
2. Bygg Hem, Upptäck, Bibliotek och Profil med Verkli-uttryck, riktiga tomma vyer och tillfälliga lokala demodata tills API:erna är klara.
3. Skapa egna development builds för iOS och Android och kontrollera att delade paket går att importera utan serverkod.
4. Kör ett begränsat tekniskt prov: riktigt testkonto, ett behörigt kapitel och en ljudfil. Prova en lokal läsrenderer med representativt bokinnehåll.

Referenser: Expo monorepos/development builds; `ReaderAppShell.tsx`; `features/reader/`; befintlig ljudroute.

Verifiera: appen startar på en fysisk iPhone och Androidtelefon, navigation och tomma vyer fungerar, en faktisk läsare når sitt kapitel, ljud överlever skärmlås och textens struktur stämmer. Kontrollera även ett långt kapitel med bilder och kursiv text. Webben ska fortfarande bygga efter lockfilsändringarna.

Skydd: använd Expo-anpassade versionsval; ingen global React-uppgradering eller dependency-override för att tysta konflikter. Expo Go räcker inte som bevis för nativefunktionerna. Inget helt Next.js-gränssnitt laddas som produktens appskal.

## 5. Fas 2 – inloggning och det gemensamma läsar-API:et

Ungefär 5–8 arbetsdagar. Syfte: samma konto och samma innehållstillgång i webb och app.

Implementera:

- Följ Supabases dokumenterade native-authmönster för inloggning, förnyelse, återgång från mejl/OAuth och utloggning. Sessionslagring ska ha testad säker adapter, inte tokens i vanlig bokcache.
- Planera Sign in with Apple om Google ska finnas i iOS-versionen. Koppla återvändande användare till rätt befintligt konto och testa provider-/e-postskillnader så att köp inte hamnar på ett nytt konto.
- Lägg en avgränsad serverhjälpare för mobilanrop: verifiera token på servern, skapa klient i användarens kontext och behåll webbens cookiehantering. Felaktigt presenterad Bearer-token får inte falla tillbaka till annan identitet.
- Inventera API:erna och komplettera luckor för bibliotek, bokdetaljer/kapitellista, kapitelinnehåll och läsprogress. Route-namn och DTO:er fastställs i denna fas; de är inte färdiga API:er idag.
- Koppla befintliga routes för sök, bokmärken, inställningar och ljud till samma autentiseringsmodell där det behövs. Återanvänd rättighetsregler på servern, inklusive bok-/kapitelköp, förhandsvisning och bokversion/språk.
- Lägg endast de DTO:er och valideringsscheman som faktiskt delas i `packages/shared`.
- Granska proxy/middleware och redirect-regler så att appanrop får strukturerade 401/403-svar i stället för en HTML-inloggningssida. Använd featureprefix i loggar, exempelvis `[reader mobile]`, utan tokens eller fullständiga boktexter.

Referenser: Supabase React Native/deep-linking; `lib/supabase/server.ts`; `lib/books/access.ts`; bibliotekssidan; `api/reader/settings/route.ts`.

Verifiera: samma konto visar samma bibliotek i webb/app; både cookie och Bearer har integrationstest; giltig, utgången och ogiltig token testas; en användare kan inte läsa någon annans skyddade data. Testa gratisbok, köpt helbok, enstaka kapitel, abonnemang, återkallad tillgång och opublicerat kapitel.

Skydd: inga service-role-hemligheter i appen; ingen duplicerad mobil betalvägg som själv avgör tillgång; inga schemaändringar utan separat beslut. Nuvarande användarroll ska inte ändras bara för att användaren öppnar läsarappen.

## 6. Fas 3 – bibliotek och läsning

Ungefär 7–10 arbetsdagar. Syfte: hela flödet från hitta bok till fortsätta läsa.

Implementera:

- Ersätt demodata med sök, upptäck, boksida och bibliotek från servern. Hantera pagination, nätfel och avpublicerade men fortsatt åtkomliga köp enligt verifierad produktregel.
- Implementera kapitelläsning med textinställningar, tema, innehållsförteckning och nästa/föregående kapitel.
- Välj renderer från provet i fas 1. En lokalt paketerad WebView för själva boktexten är ett möjligt förstaval för att bevara rik text; resten av appen förblir native. Använd den inte för inloggning eller köp. Om native-rendering ger bättre resultat, använd den bara efter test på faktisk innehållsstruktur.
- Spara befintliga bokmärken och läsprogress. Definiera skillnaden mellan högsta läsframsteg och senast öppnade position; lova inte exakt textsynk innan webbens och mobilens positionsmodell är verifierad.
- Anpassa stora textstorlekar, VoiceOver/TalkBack, tryckytor och Androids bakåtknapp.

Referenser: `features/reader/`; `ReadingProgress.tsx`; `ReaderChapterClient.tsx`; `api/bookmarks/route.ts`; innehållsformat från offlinekapitelkontraktet. Om WebView väljs ska dess officiella API och säkerhetsmönster läsas och beroendet godkännas före införande.

Verifiera: en läsare hittar en bok, sparar den, läser tre kapitel och fortsätter via biblioteket efter omstart. Stora kapitel, bilder, kursiv text, språk och olika textstorlekar kontrolleras på båda systemen. Flyttad textstorlek ska inte ge fel kapitel eller skriva över längre framsteg.

Skydd: kopiera inte `next/link`, Tailwind-/DOM-komponenter eller klientens åtkomstkontroller som nativekod. Om WebView används: sanera innehåll, begränsa navigation och håll bryggan till små validerade meddelanden. Inga generella exekveringskommandon från bokinnehåll.

## 7. Fas 4 – ljudböcker som fungerar i vardagen

Ungefär 5–8 arbetsdagar. Syfte: pålitlig lyssning när skärmen är släckt.

Implementera:

- Kopiera ljudsessionsmönstret från Expo Audio-dokumentationen: bakgrundsljud, native låsskärmskontroller, metadata och korrekt Androidtjänstkonfiguration.
- En gemensam spelare över appens skärmar, kapitelval, automatisk övergång när nästa kapitel är åtkomligt, hastighet och sovtimer.
- Synka position mot befintlig ljudprogressroute. Återuppta efter omstart och tillåt medveten återspolning.
- Hantera avbrott från samtal, urkopplade hörlurar och förlorat nät. Hämta ny signerad URL när det behövs; den aktuella server-URL:en lever i 15 minuter.
- Verifiera sovtimerns verkliga beteende i bakgrunden. En JavaScript-timer får inte vara enda grund för en utlovad funktion när operativsystemet kan pausa JS.

Referenser: Expo Audio, särskilt `setAudioModeAsync` och `setActiveForLockScreen`; `audiobook/play/route.ts`; `audiobook/progress/route.ts`.

Verifiera: minst 30 minuters strömning med låst skärm på båda systemen; Androids låsskärmskontroller aktiverade; byte över kapitelgräns; Bluetooth, samtalsavbrott, nätbyte, sovtimer och återupptagning efter utgången URL. Kontrollera att dubbla spelare inte uppstår vid navigation.

Skydd: använd inte webbens `<audio>` eller sidans livslängd som appens ljudmotor. Lagra inte signerade URL:er som permanenta nedladdningar. Testa tillgång på rätt kapitel och version, inte bara på boknivå.

## 8. Fas 5 – offlineläsning och synk

Ungefär 5–8 arbetsdagar. Grundversionen omfattar text och nödvändiga bilder, inte nedladdat ljud.

Implementera:

- Följ dokumenterade SQLite-/FileSystem-mönster för manifest, versioner, kapitel och bilder i appens privata lagring. Lås datamodell och bibliotek efter godkännande.
- Återanvänd serverns manifest/kapitelbatch och innehållshash. Nedladdning ska kunna återförsökas; märk aldrig boken som klar innan nödvändigt innehåll finns lokalt.
- Gör offlinebiblioteket öppningsbart efter kallstart i flygplansläge. Varken HTML-appskal från servern eller en aktuell signerad URL får krävas.
- Lägg en lokal kö för användarens läsprogress med återförsök. Börja med synk när appen är aktiv/återansluter; lova inte kontinuerlig synk när operativsystemet stängt appen.
- Definiera konfliktregel: högsta läsframsteg får inte gå bakåt, ljudets senaste position ska tillåta återspolning. Fördröjda offlinehändelser får inte tyst skriva över en nyare annan enhets position. Visa ett begripligt val eller använd serverrevision när konflikten inte kan avgöras säkert; eventuella schemafält kräver beslut.
- Separera cache per konto. Rensa den vid utloggning/kontobyte och respektera kontoradering.
- Besluta hur länge tidigare verifierad offlineåtkomst gäller vid abonnemang eller återkallade köp. Kontrollera på återanslutning och visa tydligt när ny uppkoppling behövs. Ingen ny dold premiumgräns.

Referenser: Expo SQLite/FileSystem/SecureStore; `lib/offline/types.ts`; `lib/offline/server.ts`; befintliga manifest-/kapitelroutes.

Verifiera: hämta bok, stäng appen, slå på flygplansläge, starta och läs nästa kapitel. Avbruten hämtning och fullt lagringsutrymme ska ge återställbart fel. Återanslut och kontrollera synk mot webben. Konto B ska inte se konto A:s cache eller köade händelser.

Skydd: service workers och IndexedDB är inte native-offlinelösningen. Ingen lösning kan upptäcka serverns återkallade rättighet omedelbart när enheten saknar nät; offlinepolicyn ska uttryckligen hantera detta. Lokal cache är inte ett löfte om DRM.

## 9. Fas 6 – lanseringsflöden och betalningsval

### 6A. Grundplan: befintlig tillgång

Ungefär 3–5 arbetsdagar för konto-/butiksförberedelser utöver kärnflödena.

- Ge gratisinnehåll och inloggade läsares verifierade köp/abonnemang åtkomst enligt serverns regler.
- Bestäm hur nya läsare kommer in: gratis konto och gratis provläsning ger en fungerande tom-start-upplevelse även utan tidigare köp.
- Utforma låsta böcker med tydlig copy som följer butik/marknad. Lägg inte in generella Stripe-köplänkar utan att kontrollera tillämpligt program och villkor.
- Färdigställ återställningslänkar, support, kontoradering, privatlivsinformation och datauppgifter för appbutikerna. Befintlig serverroute för radering är en start, inte bevis på ett färdigt appflöde.
- Använd företagets Apple Developer-, Google Play- och Expo-konton. Säkerställ ansvarig ägare, tillgång till testtelefoner, supportadress, appidentifierare och valda lanseringsmarknader tidigt.

Referenser: Apples reader-appregler och App Review Guidelines; Google Play Payments; `api/account/delete/route.ts`.

Verifiera: en ny läsare når gratisinnehåll, en befintlig köpare får rätt innehåll och kontoradering kan initieras i appen. Granska hela flödet inklusive externa länkar och butikstexter per lanseringsmarknad.

Skydd: antagandet om befintlig tillgång är ett föreslaget produktval, inte en bekräftad instruktion. Apples External Link Account Entitlement är villkorat och får inte blandas med in-app purchases i samma berättigade upplägg. Kontrollera aktuella regionala regler inför inlämning.

### 6B. Alternativ: köp från första versionen

Budgetera preliminärt ytterligare 2–4 veckor; slutligt spann beror på om vi säljer abonnemang, hela böcker och/eller kapitel och vilka marknader som väljs.

- Lås produktkatalog, rättighetsmodell och butikslösning före bygget. Utvärdera direkt StoreKit/Play Billing respektive en separat köptjänst; ett sådant beroende kräver beslut.
- Validera köp på servern och koppla dem till befintligt Verkli-konto. Samordna butiksköp och Stripe-tillgång utan dubbla rättigheter.
- Hantera återställ köp, väntande/avbrutna köp, förnyelser, utgång, återbetalning och återkallelse. Servernotiser måste tåla dubletter och annan ordningsföljd.
- Visa korrekta butikspriser, villkor och väg till abonnemangshantering. Stöd byte mellan webb och app utan att användaren köper samma tillgång igen.

Referenser före implementation: aktuella officiella StoreKit- och Play Billing-guider samt vald integrationsleverantör. API-signaturer och eventformat måste dokumenteras i denna etapp, inte antas från denna plan.

Verifiera: sandboxköp på båda systemen, återställning på ny enhet, redan köpt innehåll via webben, förnyelse/återbetalning och dubbla servernotiser. Schema- och katalogändringar presenteras separat för beslut.

## 10. Fas 7 – verifiering, beta och release

Ungefär 7–12 arbetsdagar inklusive betafel och plattformsspecifik stabilisering. Betatest pågår även under tidigare faser.

Implementera:

- Egna profiler för development, preview och production. Testmiljö och produktion ska ha tydligt separerade URL:er och appkonfigurationer.
- Separata CI-kontroller för mobil och webb. Rotens befintliga `lint`, `test` och `build` kör idag webben; mobilkontroller måste läggas till uttryckligen.
- Efter scriptdefinition: kör `npm run lint -w @verkli/mobile`, `npm run typecheck -w @verkli/mobile` och `npm run test -w @verkli/mobile`. Kör webbens lint, test och build när backend, delade paket eller lockfil påverkas. Mobilens skript finns inte ännu.
- Bygg verkliga nativebinärer för båda systemen; ett lyckat webbbygge eller JavaScript-export bevisar inte att appen fungerar.
- Interna iOS-/Androidbyggen tidigt, därefter TestFlight och relevant Google Play-testspår. Lansera iOS först när dess kriterier är uppfyllda; fortsätt Androidverifieringen under tiden.
- Kontrollera företagskontonas aktuella publicerings- och testkrav, signering, skärmbilder, åldersklassning, innehållsrapportering, supportlänkar och ett fungerande granskningskonto med representativ åtkomst.
- Instrumentera krascher och centrala fel utan boktext/tokens. Definiera versionerad release, stegvis utrullning och åtgärd vid fel. En installerad binär kan kräva en ny butiksuppdatering; förlita er inte på att webbdeploy återställer appen.

Referenser: EAS Build/Submit; appbutiksregler; `apps/web/playwright.config.ts`; befintliga route-tester. Val av native E2E-verktyg tas tillsammans med övriga nya beroenden.

Verifiera: alla acceptanstester nedan på fysiska enheter och produktionslik miljö; granskningskonto fungerar; äldre appversion fungerar mot nytt API; webbens läsar- och författarflöden har inte regressionsfel från gemensamma ändringar.

Skydd: inga hemligheter i publika appvariabler. Inga brytande API-ändringar som kräver att alla redan installerade appar uppdateras samtidigt. Publiceringsgodkännande är separat från testuppladdning och själva kodplanen.

## 11. Gemensamt QA-script

1. Installera appen på iPhone och Android, registrera/logga in och verifiera mejl/återställningslänk efter att appen stängts. Kontrollera samma konto på webben.
2. Sök efter en gratisbok och en köpt bok. Kontrollera bibliotek, rätt kapitelåtkomst och tydligt låst innehåll utan obehörig text/ljud.
3. Läs flera kapitel, ändra textstorlek/tema, spara boken, starta om och kontrollera läsprogress samt VoiceOver/TalkBack.
4. Lyssna minst 30 minuter med skärmlås, byt kapitel, prova hörlurar, samtalsavbrott, sovtimer och återuppta efter nätavbrott.
5. Hämta en textbok, stäng appen och läs i flygplansläge efter kallstart. Återanslut och kontrollera synk utan förlorad progress eller kontoöverskridande data.
6. Testa utloggning/kontobyte och kontoradering. Om köp ingår: testa köp, avbrott, återställning på ny enhet och återkallad tillgång.
7. Kör samma kärnflöde i kandidatbyggena för TestFlight/Google Play och kontrollera webbens bibliotek, läsning och inloggning efter backendändringarna.

## 12. Tid, osäkerhet och första milstolpe

Planeringsram för en erfaren utvecklare på heltid med AI-stöd, tillgängliga testkonton/testtelefoner och löpande produktbeslut:

| Milstolpe | Preliminärt från start |
| --- | --- |
| Klickbar demo på båda systemen och tekniskt prov | Vecka 1 |
| Sammanhängande läsarbeta med riktiga data | Vecka 3–5 |
| iOS-kandidat med textoffline och stabilt ljud | Vecka 6–10 |
| Android-kandidat med samma kärnfunktioner | Vecka 8–14, ofta tidigare om enhetstesterna går bra |

Arbetet är gemensamt för båda systemen från första veckan. Androidspannet omfattar plattformstestning och releasearbete, inte en andra fullständig implementation. Fasernas dagspann är planeringsstöd och kan överlappa; milstolparna omfattar integrationsmarginal. Konto-/avtalsarbete, butikernas handläggning och större befintliga backendfel kan förlänga kalendern.

Störst osäkerhet: betalningsomfattning, befintliga API-/RLS-reglers faktiska beteende, bokrendering/positionsmodell och ljudets bakgrundsbeteende. Omvärdera tidsramen efter fas 1–2 med mätbara resultat.

Första körbara leverans: `apps/mobile` med Verkli-navigation, ett riktigt läsarkonto, en bok, ett kapitel och fungerande låst-skärm-ljud på både iPhone och Android. Den leveransen avgör detaljvalen innan fler skärmar byggs.
