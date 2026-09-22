# Mer färdigt i bokverktyget

14 september 2026. Fortsättning på checklistleveransen samma dag. Byggt och verifierat lokalt; detta uppdrag har inte driftsatt ändringarna. Den externa författarresan och återkopplingen till Hannes är pausade enligt beslut i uppdraget.

## Det som nu går att bocka av

| Funktion | Status | Vad författaren får |
|---|---|---|
| Korrektur med godkänn och avvisa | Byggt | Originaltext, föreslagen rättning och förklaring. Varje ändring väljs separat och sparas först efter kontroll att kapitlet inte ändrats. |
| Ångra senaste godkända rättning | Byggt | Senaste sparade rättningen kan återställas under samma granskningssession. Nyare text skrivs inte över. |
| Analys kapitel för kapitel | Byggt | Kommentarer om handling, karaktärer, tempo och stil. Alla kapitel kan läsas i följd; långa kapitel delas upp och täckningen visas. |
| Jämför original och översättning | Byggt | Två texter bredvid varandra, upptäckta avvikelser och rättningar som kan godkännas. Författaren väljer källversion och kontrollerar kapitelordningen. |
| Spara granskningsrapport | Byggt | Ladda ner resultat och beslut innan granskningssidan lämnas. |
| AI-utkast för en schemalagd kampanj | Byggt | Texter anpassade till bok, språk, kanal, mål och schemadag. Misslyckade körningar ger fel; delvis skapade planer kan fortsätta utan att godkända eller redigerade inlägg skrivs över. |
| Saldo och utbetalningshistorik | Byggt | Verkligt tillgängligt och väntande Stripe-saldo per valuta samt senaste 100 bankutbetalningarna. Saknade uppgifter visas som fel eller tomläge. |
| Ladda ner utbetalningsunderlag | Byggt | CSV för samma senaste 100 utbetalningar, med tydlig omfattning. Kontoanslutning från sidan leder vidare till Stripe. |

Den ursprungliga checklistans **20** går från Kvar till Byggt. **21** och **42** går från Kvar till Delvis. **27, 41 och 47** får fler färdiga delar men behåller Delvis eftersom deras fulla ursprungliga löften är större. Listan har nu **18 Byggt, 31 Delvis, 9 Kvar och 3 Ej styrkt**. De 61 områdena är olika stora; siffrorna är inte ett procentmått på plattformens färdigställande.

## Nästa arbete i klartext

1. **Hela bokens röda tråd.** Sammanväg kapitlen så handling, karaktärer och tidslinje kontrolleras genom hela boken. Dagens analys är kapitelvis och saknar den sammanvägningen.
2. **Översättningens hela kvalitetskedja.** Det separata arbetet i `translation-quality-20260914` behöver integreras och verifieras. Dagens manuella granskning kompletterar den kedjan och ersätter den inte. Bestäm vilka språk som ska vara kvalitetsgodkända först.
3. **Pengar hela vägen.** Besluta om Verkli ska ha 25 eller 30 procent, hur abonnemangspengar fördelas och när utbetalning sker. Därefter behöver royaltyberäkning, överföring och avstämning mot köp och återbetalningar bli en sammanhängande leverans.
4. **Kampanjer hela vägen.** Koppla godkända utkast till verkliga sociala konton, publicering eller utskick, felhantering och uppföljning. Inga inlägg eller mejl har skickats i detta uppdrag.
5. **Få ihop den färdiga versionen.** Integrera lokala arbetspaket och prova betalning, bibliotek, komplett ljudbok och återupptagning tillsammans. Vänta med den externa författarresan och Hannes tills den internt beslutade omfattningen håller.

## Förtydliganden att lägga in i planen

- Separata kolumner för byggt, kontrollerat i drift och öppet för användare.
- Granskningshistorik sparad mellan sessioner. Nu kan rapporten laddas ner; den lagras inte som en egen historik i kontot.
- Budget och begripliga besked för långa AI-jobb. Att lämna granskningssidan avbryter fortsatt granskning; färdiga resultat måste laddas ner först.
- Översättningsjämförelsen matchar kapitelpositioner. Stora kapitelpar över 80 000 tecken behöver delas upp. Nya eller flyttade kapitel kräver kontroll av författaren.
- Ekonomiöversikten visar pengar som redan finns på det kopplade Stripe-kontot. Obetalda eller ännu inte fördelade royaltyintäkter ingår inte. CSV är inte en full månadsrapport med skatt och samtliga avgifter.
- Utse ansvariga för innehållskvalitet, kampanjgodkännande och avstämning av pengar. Det är separata uppgifter som ett grönt gränssnitt inte avgör.

Mobilappar, belöningar, liveevent, familjeplan, merchandise och tjänstemarknadsplatser kan fortsatt vänta enligt tidigare förslag. Inga krav har strukits utan produktbeslut.

## Verifiering

- 1 906 tester i 188 filer passerar. Lint, typkontroll, produktionsbygge med Node 22 och kontroll av engelska som standardspråk passerar. Den sistnämnda kontrollen rättades parallellt av ett annat arbetspaket.
- Riktiga AI-prov med påhittad testtext: korrektur, kapitelanalys, svensk–engelsk översättningsgranskning och svenskt kampanjutkast med kampanjmål och kanal.
- Översättningsprovet avslöjade ett ogiltigt JSON-svar. Leverantörsanropet använder nu ett styrt svarsschema; nytt riktigt prov hittade alla fyra avsiktliga betydelsefelen.
- Chrome med 1 200 och 390 pixlars bredd: godkänn/spara, avvisa, ångra, nekad inaktuell rättning, originaljämförelse, alla kapitel och delar, export samt AI-fel. Mobilbredd rättad; inga sidfel eller horisontell överströmning.
- Verklig inloggning på localhost med befintligt automatiskt testkonto, visning av granskningspanelen och lyckat anrop till den riktiga granskningsrutten med testkapitlet. En avsiktlig korrekturrättning sparades genom det riktiga gränssnittet och Supabase och ångrades därefter. Testkapitlets ursprungliga innehåll är återställt. Utbetalningssidans anslutningsläge öppnat.
- Saldo, flera valutor, utbetalningar, CSV och felvägar verifierade med simulerade Stripe-svar. Inget nytt Stripe-konto och ingen utbetalning skapad.
- Sparningen använder befintlig tidsstämpel och databasens uppdateringstrigger. Långa kapitel läggs inte i URL-parametrar. Fel, ändrad text eller en samtidig skrivning avvisas.
- Ingen ny dependency eller schemaändring. Befintlig granskningspanel och autosparande återanvänds. Ändringarna i kampanjmotorn kräver att den nya workerversionen driftsätts.

## Prova på localhost

Starta med `npm run build -w @verkli/web` och `npm run start -w @verkli/web -- --hostname 127.0.0.1 --port 3050` om previewn har stängts. Granskning och AI-utkast använder det befintliga AI-kontot.

1. Logga in som författare, öppna en egen bok och välj **Review**. Lägg vid behov in och spara en avsiktlig språkmiss i ett testkapitel först.
2. Kör **Proofreading**. Avvisa ett förslag; godkänn ett annat och kontrollera texten. Prova **Undo last accepted change**.
3. Välj **Manuscript analysis** och **Review all chapters**. Kontrollera antal kapitel/delar och ladda ner rapporten.
4. Öppna en översatt version, välj **Translation**, välj originalets språk och jämför båda texterna. Kontrollera avvikelserna och granska rättningsförslagen.
5. På **Marketing**, skapa en kort textkampanj och kör `npm run marketing-worker -w @verkli/web` med befintlig konfiguration. Kontrollera språk, variation och att inläggen är utkast.
6. Öppna **Payouts**. Ett kopplat Stripe-testkonto ska visa separata valutor och historik som stämmer med CSV-filen. Utan koppling visas anslutningsläget.

## Ändrade filer

Dagens två leveransomgångar omfattar följande filer. Diffen jämför deras aktuella innehåll med HEAD; den bevarar samtidiga ändringar i delade filer.

- `apps/web/messages/en.json`
- `apps/web/messages/sv.json`
- `apps/web/scripts/marketing-worker.ts`
- `apps/web/src/app/(app-author)/author/billing/payouts/page.test.tsx`
- `apps/web/src/app/(app-author)/author/billing/payouts/page.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/BookEditorPanelContent.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/BookEditorView.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud.review.test.ts`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud.review.ts`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useChapterCrud.ts`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useMarketing.test.ts`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/hooks/useMarketing.ts`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/EditorialReviewPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/MarketPanel.tsx`
- `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/ReviewPanel.tsx`
- `apps/web/src/app/(app-reader)/reader/settings/page.tsx`
- `apps/web/src/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer.tsx`
- `apps/web/src/app/api/billing/connect/onboard/route.test.ts`
- `apps/web/src/app/api/billing/connect/onboard/route.ts`
- `apps/web/src/app/api/billing/connect/payout-report/route.test.ts`
- `apps/web/src/app/api/billing/connect/payout-report/route.ts`
- `apps/web/src/app/api/books/[id]/editorial/review/route.test.ts`
- `apps/web/src/app/api/books/[id]/editorial/review/route.ts`
- `apps/web/src/app/api/books/[id]/marketing/generate/route.test.ts`
- `apps/web/src/app/api/books/[id]/marketing/generate/route.ts`
- `apps/web/src/app/api/reader/export/route.test.ts`
- `apps/web/src/app/api/reader/export/route.ts`
- `apps/web/src/components/books/NoDownloadAudioPlayer.test.tsx`
- `apps/web/src/components/books/NoDownloadAudioPlayer.tsx`
- `apps/web/src/components/reader/ReadingDataExport.tsx`
- `apps/web/src/features/author-workspaces/marketing/CampaignDetailView.tsx`
- `apps/web/src/features/author-workspaces/marketing/MarketingPortalView.tsx`
- `apps/web/src/lib/editorial/content.test.ts`
- `apps/web/src/lib/editorial/content.ts`
- `apps/web/src/lib/editorial/provider.test.ts`
- `apps/web/src/lib/editorial/provider.ts`
- `apps/web/src/lib/editorial/review-schema.ts`
- `apps/web/src/lib/error-messages.ts`
- `apps/web/src/lib/marketing/campaign-worker.test.ts`
- `apps/web/src/lib/marketing/generate-launch-copy.test.ts`
- `apps/web/src/lib/marketing/generate-launch-copy.ts`
- `apps/web/src/lib/marketing/launch-copy-provider.ts`
- `apps/web/src/lib/payments/stripe-payouts.test.ts`
- `apps/web/src/lib/payments/stripe-payouts.ts`
- `docs/plans/2026-09-14-checklist-delivery.md`
- `docs/plans/2026-09-14-editorial-campaign-payout-delivery.md`
