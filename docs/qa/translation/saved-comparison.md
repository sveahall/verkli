# Sparad översättning i Translate

Translate har en separat läsande öppning av sparad målutgåva och aktuellt sparat original. Den använder bokägarskap, exakt sourceVersionId, bokbunden målspråksutgåva och endast aktiva kapitel. Dubbla målutgåvor ger fel i stället för ett gissat val. Inga provideranrop eller betalningar krävs för att öppna, uppdatera eller byta språk. Den tidigare automatiska AI-förhandsvisningen kräver nu knappen Generate opening preview, med synlig information om AI-förbrukning.

Sparade granskningsfynd hör till samma käll-/målutgåva. Fingeravtryck jämförs med den hämtade texten, inte med en senare databassnapshot; ändrad text får ingen aktuell kvalitetsmarkering. Historiska fynd, verifieringsosäkerhet och behov av mänsklig granskning visas uttryckligen. Kapitel kopplas via position. Dubbla/okända positioner gissas inte, och kapitel som bara finns i målutgåvan döljs inte. Det är inte en meningsvis alignmentmotor eller full historik för tidigare texter.

## Lokal UI QA

Starta `npm run dev -w @verkli/web -- --port 3217` med Node 22 och lokala offentliga Supabase-platshållare. Öppna `http://localhost:3217/dev/translation-studio`. Vyn finns endast i development och alla externa/API-anrop fångas av syntetiska fixtures.

1. Välj ready, öppna sparad översättning och kontrollera sv-utgåvans ID, aktuell text och båda kapitlen. Öppna rapport/fynd och kontrollera att de anges som historiska.
2. Kontrollera Fixture request evidence: öppning/uppdatering gör bara läsningar, inga translation-preview, translate eller checkout-anrop. Ladda om och öppna igen.
3. Välj slow, öppna och byt omedelbart Target language till ar. Öppna igen; endast ar visas. Byt Source edition under en ny långsam laddning och kontrollera rätt original. Välj sedan Swedish edition när målet är svenska, samt Dutch/Polish edition när motsvarande målspråk är valt: målvalet måste ändras till ett annat språk och öppningen använda samma mål som UI visar.
4. Prova unavailable, empty och failure. Kontrollera skillnaden mellan saknad utgåva, tomma kapitel och laddningsfel, samt möjlighet att uppdatera.
5. Prova report-failure och edited. Texten ska kunna visas även om rapport saknas; ändrat textfingeravtryck ska anges tydligt.
6. Prova 390 px, tangentbordsfokus och arabiskt RTL. Välj Generate opening preview först när du avsiktligt vill starta en separat AI-förhandsvisning (syntetisk i fixturen).

Automatiserad browserregression: `apps/web/e2e/saved-translation.spec.ts`. Normala Playwright-konfigurationen startar localhost:3000; den fristående beviskörningen använde localhost:3217, en worker och installerad Chrome. Kör enbart denna spec med `npm run test:e2e -w @verkli/web -- saved-translation.spec.ts --project=chromium` när lokal Playwright-browser finns.

## Begränsningar

Syntetisk browser-QA och mockade behörighetsregressioner ersätter inte inloggat prov mot riktiga sparade editionsdata efter integration. Ingen produktionskörning, betald AI, schemaändring, ljudändring eller publicering ingår. Varje edition måste ha färre än 1000 kapitel i denna vy; stora svar får ett tydligt fel och ingen tyst trunkering. Öppnad vy är en snapshot: uppdatera efter redigering i annan flik. Granskningen visar upp till tio senaste rapporterna från befintligt API, inte fullständig arkivhistorik.
