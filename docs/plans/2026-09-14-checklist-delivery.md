# Första tre leveranserna till plattformschecklistan

**Senare samma dag:** se [fortsättningen med korrektur, kampanjer och utbetalningsöversikt](2026-09-14-editorial-campaign-payout-delivery.md) för aktuellt läge och 1 906 godkända tester. Extern författarresa och Hannes är nu pausade. Nedan dokumenteras första omgången.

14 september 2026. Byggt och testat lokalt ovanpå `e49d3c40`. Ändringarna är inte driftsatta.

## Det som går att bocka av nu

- **Ljudreglage:** välj hastighet 0,5–2× och sovtimer på 5, 15, 30 eller 60 minuter. Samma reglage används vid kapitellyssning och i spelaren för hela ljudboken. Spelaren behåller kopplingen till befintlig sparad lyssningsposition. Timern gäller medan spelaren är öppen; riktiga mobilers bakgrundsuppspelning behöver fortfarande långtidstestas.
- **AI-marknadstext i bokeditorn:** riktig generering utifrån titel och bokbeskrivning på det valda språket och för den valda kanalen. Tidigare användes fast malltext och språkvalet kunde bli ett klick efter. Ogiltiga AI-svar sparas inte över tidigare utkast. Befintlig Pro-begränsning gäller. Författaren granskar och delar själv.
- **Ladda ned läsdata:** läsarinställningarna har en knapp för en fil med läsinställningar, sparade böcker samt läs- och lyssningspositioner. Bara den inloggades data hämtas, även om listorna kräver flera hämtningar. Fel ger ett felmeddelande i stället för en ofullständig fil.

Punkt **34** och **45** i checklistan går från Delvis till Byggt. **55** är fortsatt Delvis: samlad kontodata och fullständig radering återstår. Marknadsföringsarbetarens och andra kampanjflödens malltexter har inte ersatts av denna ändring.

Hela visionslistan har nu **17 Byggt, 29 Delvis, 12 Kvar och 3 Ej styrkt**. Det är 61 olika stora områden, inte ett procentmått på nedlagt arbete. I den avgränsade septemberlanseringen är **7 av 12 områden byggda**, men slutproven återstår. Den listan är en bättre utgångspunkt för vad som måste bli klart nu.

## Vad vi ska arbeta mot

1. **Första kunden hela vägen:** rätt bok och format, betalning, mejl, bibliotek, ljud och fortsatt lyssning på mobil. Kontrollera även återbetalning och nekad åtkomst för någon som inte köpt.
2. **Första externa författaren hela vägen:** importera eget manus, ändra, producera, publicera och få en riktig kund. Mät hur mycket hjälp personen behöver.
3. **Den större produkten:** korrektur med godkänn/avvisa, analys av hela manuset, kvalitetsgranskade översättningar, fullständiga ljudleveranser, automatiska kampanjer och korrekt royalty/utbetalning. Det är separata leveranser.

## Förslag att parkera

Mobilappar, Coin/belöningar, liveevent, familjeplan, merchandise och tjänstemarknadsplatser kan ligga i en senare fas. Inget av detta har tagits bort eller omprioriterats utan produktbeslut.

## Saker att lägga till eller förtydliga i planen

- **Ett aktuellt erbjudande:** pris, plattformsandel, betalpaket, språk och format. Underlagen säger olika saker om flera av dessa.
- **Vad ”klart” betyder:** namngiven ansvarig och ett enkelt slutprov per leverans. Separera byggt, kundtestat och öppet för kunder.
- **Vad AI faktiskt gör:** tydlig skillnad mellan AI-utkast, malltext och en automatiserad kampanj. Alla tre förekommer i kodbasen.
- **Driften efter köp:** vem granskar bok/ljud, vem svarar kunden, vad händer vid misslyckat jobb och hur återställer vi förlorat innehåll?
- **Läsdata kontra all kontodata:** dagens export omfattar inte exempelvis köp, meddelanden, manus, markeringar eller anteckningar. Hela datapaketet och radering behöver en egen avgränsad leverans.

## Kontroller genomförda

- `npm test -w @verkli/web`: **1 831 tester i 178 filer passerar**, inklusive 18 nya tester.
- `npm run lint -w @verkli/web`: passerar.
- `npm run build -w @verkli/web`: passerar med Turbopack och middleware.
- `npm run check:dead-code -w @verkli/web`: passerar.
- Lokal Chrome-körning av de riktiga komponenterna, både 1 100 och 390 pixlar brett: hastighet före laddad ljudmetadata, timer som löper ut och stängs av, kapitelbyte, vidarebefordrade pause/seek/metadata-händelser, exportfel och lyckad nedladdning. Inga sidfel eller horisontell klippning.
- Verklig inloggning via läsarens UI på localhost, läsarroll vald i webbläsaren och hämtning från `/reader/settings`: filen innehöll kontots läsdata. Inga kontobehörigheter ändrades. Första provskriptet väntade för kort tid på inloggningen; med korrekt väntan gick flödet igenom.
- Ett riktigt AI-anrop med påhittad svensk testbok: användbart svenskt utkast returnerades genom den nya leverantörsfunktionen. Ägarskap, Pro-gräns, anropsbegränsning, lagring och fel testades separat med simulerade API-beroenden. Ingen kampanj publicerades.
- Extra kontroll `check:english-default` flaggar fyra **befintliga** svenska/tyska exempeltexter i `src/features/author/author-experience-data.ts`. Filen är oförändrad i denna leverans; kontrollen är inte grön.

Detta är inte ett genomfört köp, produktionstest av hela ljudböcker eller ett lanseringsgodkännande. Ingen ny dependency eller databasändring har införts.

## Prova själv på localhost

Preview finns på `http://127.0.0.1:3046`. Om den har stängts: `npm run build -w @verkli/web` och sedan `npm run start -w @verkli/web -- --hostname 127.0.0.1 --port 3046`.

1. Logga in, byt till läsarroll och öppna `/reader/settings`. Välj **Download reading data** och kontrollera filens innehåll.
2. Öppna ett kapitel med tillgängligt ljud. Välj **1.5×**, spela och spola; kontrollera att uppspelningen och sparad position fungerar.
3. Välj **5 minutes** i **Sleep timer**. Låt spelaren vara öppen tills den pausar. Prova också att stänga av timern innan tiden går ut.
4. Öppna en tillgänglig ljudbok med flera spår och kontrollera samma reglage efter kapitelbyte.
5. Som författare med befintlig Pro-åtkomst: öppna bokens marknadspanel, välj exempelvis svenska och Instagram och klicka **Generate AI draft**. Kontrollera språk och fakta. Detta gör ett riktigt AI-anrop; ingenting publiceras automatiskt.

## Ändrade filer

- `apps/web/src/components/books/NoDownloadAudioPlayer.tsx` och test: ljudreglage.
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer.tsx`: gemensam spelare även för kapitel.
- `apps/web/src/lib/marketing/generate-launch-copy.ts` och test: verklig AI, begränsningar och reservleverantör.
- `apps/web/src/app/api/books/[id]/marketing/generate/route.ts` och test: generera och spara verifierat utkast för rätt författare.
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useMarketing.ts` och test: använd det språk och den kanal som valdes vid klicket.
- `apps/web/src/app/(app-author)/author/books/[id]/editor/BookEditorPanelContent.tsx`: skicka valen direkt.
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/MarketPanel.tsx`: tydlig AI-knapp och granskningsinformation.
- `apps/web/src/lib/error-messages.ts`: begripliga AI-fel.
- `apps/web/src/app/api/reader/export/route.ts` och test: export av egna läsdata.
- `apps/web/src/components/reader/ReadingDataExport.tsx`: nedladdning, laddningsläge och fel i UI.
- `apps/web/src/app/(app-reader)/reader/settings/page.tsx`: visar exportknappen.
- Detta dokument: leveranser, bevis, avgränsningar och slutprov.
