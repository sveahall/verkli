# Bokflöde – design och UI-regressioner, 14 september 2026

Lokal implementation på `codex/book-workflow-20260914`, baserad på `platform` vid `1293e720`.
Ingen produktionspublicering i denna ändring. Ingen ny dependency eller schemaändring.

[Öppna komponentförhandsvisningen](http://localhost:3025/dev/book-workflow).
Denna route använder lokala exempeldata och finns endast i development. Omslagsgenerering och assistentsvar är tydligt märkta testresultat; inga bokuppgifter skrivs och inga AI-leverantörer anropas. Steglänkarna går till bokarbetsytan, som fortfarande kräver vanlig inloggning.

## Vad som ändrats

| Före | Efter | Varför |
| --- | --- | --- |
| 300 px omslag plus ett hoptryckt formulär när assistenten öppnas | Omslagskolumner styrs av verklig komponentbredd; assistenten dockas bara med tillräckligt utrymme | Läsbara och användbara formulär även med författarmenyn synlig |
| Dubbla steglänkar och små punkter | En 44 px länk per steg, tydligt aktivt steg, horisontell scroll vid behov | Färre tabbstopp, större klickytor; Pricing ligger kvar före Publish |
| Vita ytor med dubbla marginaler och stor tom mobilruta | Brandens papper/plommon, gemensamma kanter och typografi, kompakt mobiluppladdning | Sammanhållen arbetsyta |
| Assistentsvar kunde scrolla hela sidan; stängning raderade samtalet | Endast konversationen scrollas; samma komponent behåller samtalet genom stängning och resize | Arbetsposition och sammanhang bevaras |
| Assistenten visade bara skrivfrågor | Omslag, ljudbok, översättning och publicering får relevanta förslag | Kontext som passar den aktiva panelen |
| Byte tillbaka från egen prompt nollställde mallfält | Mallval och utkast behålls | Inmatning försvinner inte |
| 1600 × 2400 angavs som 3:4; förhandsvisningar kunde beskära bilden | 1800 × 2400 matchar befintlig 3:4-beskärning; artwork visas helt | Korrekta instruktioner och förhandsvisningar |
| Ljus sidomeny använde vit logotyptext | Mörk/ljus logotyp följer temat | Läsbar identitet i båda lägen |

## QA – fem steg

1. Öppna förhandsvisningen på 1440 px och 390 px. Kontrollera omslag, formulär och stegnavigering. Inget får göra hela sidan bredare än skärmen.
2. Öppna AI Assistant. På laptop/mobil öppnas en modal; på en tillräckligt bred arbetsyta dockas den. Tab ska stanna i modalen och Escape ska stänga den och återge fokus till öppningsknappen.
3. Välj en annan mall, skriv ett utkast och byt till egen prompt och tillbaka. Mallval, malltext och egen prompt ska finnas kvar.
4. Välj ett assistentförslag och tryck Skicka. Stäng, öppna och ändra fönsterbredden: det lokala testsamtalet ska finnas kvar och sidan ska inte hoppa. Generera omslag visar ett tydligt preview-meddelande utan AI-anrop.
5. Växla ljust/mörkt läge. Lägg till en lokal JPG/PNG och ta bort den igen. Hela bilden ska visas. En textfil ger ett läsbart fel. Ändringarna stannar i förhandsvisningen.

## Verifiering och gränser

- `npm test -w @verkli/web`: 173 testfiler, 1 748 tester passerade.
- `npm run lint -w @verkli/web`: passerade.
- `npm run build -w @verkli/web`: produktionsbygge kontrollerat.
- `node apps/web/scripts/qa-book-workflow.mjs`: Chromium UI-regressioner på 1920, 1440, 1024, 768, 390 och 320 px; fokus, utkast, historik, lokala bilder, fel/laddning, ljust/mörkt och reduced motion.
- Skärmbilder: `/tmp/verkli-book-workflow-qa/`.
- Unit-regressionerna skyddar Pricing-ordningen, ett aktivt steg och att utvecklingsförhandsvisningen inte exponeras i production.
- Omslag och assistent är visuellt och interaktivt provade i komponentförhandsvisningen. Audio, Translate, Publish och Review har fått containerbaserade kolumner genom samma arbetsflöde; deras autentiserade affärsflöden har inte körts igenom i denna QA.
- Denna körning verifierar UI. Den verifierar inte nya AI-resultat, betalning, sparning i en riktig bok, ljudgenerering eller publicering. Inga sådana produktionstransaktioner gjordes.
