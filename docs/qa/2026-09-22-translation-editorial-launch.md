# Översättning och redaktionell granskning inför lansering

Fixen utgår från `origin/platform` vid `296f2faf`.

- Helboksanalys, kapitelgranskning och kvalitetsprov använder nu middleware för
  origin-kontrollen. Den publika adressen jämförs inte längre med proxyns interna adress.
- Saknat källspråk detekteras från upp till 1 000 ord över sparade kapitel, även
  när boken börjar med en tom sida eller en kort titel. Borttagna kapitel ignoreras.
- Om manusläsningen misslyckas svarar översättningsanropen med ett återförsöksbart
  serverfel. En betald översättning kan återförsökas genom befintlig återställning av betalningsanspråket.
- Förhandsvisning och översättningsknappar visar begripliga felmeddelanden.

## Verifierat lokalt

- 188 riktade tester i 8 testfiler passerar.
- Playwright-testet `translation-language-recovery.spec.ts` passerar i Chromium.
- ESLint på samtliga ändrade TypeScript-filer passerar; `git diff --check` är ren.
- Node 24.19.0 och oförändrade låsta beroenden installerade med `npm ci` användes.
- Full build och hela testsviten är inte godkända här. Breda körningar avbröts
  under hög datorbelastning och lämnades till releaseansvarigs exklusiva kontrollslot.

## QA via localhost

1. Öppna `http://localhost:3187/dev/translation-quality` och välj **Book job flow**.
2. Välj **Missing source language**. Kontrollera att felet förklaras med vanlig
   text och att originalets ”Natten var tyst.” ligger kvar.
3. Klicka **Retry preview**, **Translate book** och därefter **Take your book
   further → Translate selected languages**. Ingen rå API-felkod ska visas.
4. Välj **Checks passed** och klicka **Translate book** igen. Förhandsvisningen
   återkommer, felmeddelandena försvinner och originalet är oförändrat.
5. Inför deploy: testa på ett testkonto med ett manus som börjar med tomma sidor,
   välj franska och kontrollera förhandsvisning samt färdig översättning.
6. Via den publika testadressen bakom proxyn: kör helboksanalys, kapitelgranskning
   och översättningens kvalitetsprov. Inget anrop ska ge ”Request origin is not allowed”.

Steg 1–4 använder förberedda svar och gör inga modell- eller manusändringar.
Steg 5–6 kräver ett testkonto och konfigurerade tjänster; lokala tester ersätter
inte kontrollen av dessa produktionsflöden. Den här fixen är inte deployad.

## Önskemålen om omslag

Författarpresentation redigeras redan under **Author profile → About me**.
Att hämta presentationen till omslaget och skapa skyddsomslag med flikar är
separata funktionsönskemål från den bifogade konversationen och ingår inte i felrättningen.
