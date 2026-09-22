# Språk och kvalitetsprov den 22 september 2026

Detta underlag skiljer specifikation, tekniskt valbart textstöd och verifierad litterär kvalitet. Det ändrar inte lanseringslöftet och certifierar inte ljud. Bas för inventeringen: 296f2faf (PR76).

## Primär källa

`/Users/admin/Downloads/Verkli Erbjudande Fredrik 2026-07-29.docx`, Bilaga 1, §3.2.1 (stycke 128 i dokumentets OOXML):

> Lanseringsspråk (v1): engelska, spanska, tyska, franska, portugisiska, italienska, holländska, polska, japanska, mandarin.

§3.2 anger hög lingvistisk kvalitet; §3.2.1 beskriver primäröversättning, separat betydelsegranskning, stilkontroll och slutkorrektur med inspekterbar utdata; §3.2.2 beskriver kapitelval och jämförelse av tidigare/nuvarande versioner. Den nya jämförelsen visar nuvarande original/mål och historiska fynd, inte återställningsbara äldre hela översättningar. Det sistnämnda är kvar.

`/Users/admin/Downloads/Verkli_Produktionsplan_och_lanseringsplan_2026.docx` kräver utvärdering av upplevd översättningskvalitet, men ersätter inte ovanstående namngivna lista med en annan lista. `docs/roadmap.md` är ett äldre arbetsunderlag. `/Users/admin/Documents/Verkli/Language-expansion-2026-09-18/PLAN.md` innehåller förslag A/B/C, inte beslut.

## Matris före separat språkpatch

| Språk | Kod | Spec v1 | Centralt textval på basen | Provkrav utöver gemensam rubric |
|---|---|---|---|---|
| Engelska | en | Ja | Ja | Tempus, idiom, brittisk/amerikansk variant enligt författarens val |
| Spanska | es | Ja | Ja | Tilltal och regional variant utan påhittat produktbeslut |
| Tyska | de | Ja | Ja | Du/Sie, sammansättningar, dialoginterpunktion |
| Franska | fr | Ja | Ja | Tu/vous, tempus, typografiska mellanrum |
| Portugisiska | pt | Ja | Ja | PT/BR konsekvens enligt beställd variant |
| Italienska | it | Ja | Ja | Tilltal, tempus, klitiker och idiom |
| Holländska | nl | Ja | Nej; befintlig Anthropic-routing finns | Tilltal, partikelverb och ordföljd |
| Polska | pl | Ja | Nej; befintlig Anthropic-routing finns | Kasus, aspekt, genus och namn |
| Japanska | ja | Ja | Ja | Register, underförstått subjekt, namn och radbrytning |
| Mandarin | zh | Ja | Ja, UI kallar det Chinese | Skriftvariant och regional norm måste dokumenteras av granskaren; koden zh avgör inte detta |
| Svenska | sv | Extra/källspråk | Ja | Negation, sammansättningar, ton och dialog |
| Ryska | ru | Extra | Ja | Aspekt, genus, tilltal och namn |
| Koreanska | ko | Extra | Ja | Hövlighetsnivåer, namn och utelämnat subjekt |
| Arabiska | ar | Extra | Ja | Register, RTL, siffror och blandad skrift |

`src/lib/languages.ts` styr API-validering och menyer. `src/lib/translation-pairs.ts` har bredare provider-routing. Den granskade bokkedjan använder `src/lib/ai/translation-quality/anthropic.ts`; generisk routingtillgänglighet är inte bevis för det faktiska modellvalet eller kvaliteten. Ingen borttagning av befintliga extraspråk ingår.

## Reproducerbart underlag utan provideranrop

Kör från `apps/web` med Node 22:

```
npx tsx scripts/prepare-translation-evaluation.ts --out=/absolute/new-directory
```

Kommandot accepterar inte `--live`. Det skapar deterministiskt manifest med SHA-256 per källa, språkmatris, granskningsblad och längre syntetiska manus. Spara manifestet tillsammans med framtida provider-/mänskliga resultat. Samma version ger samma innehåll och fingeravtryck. Inga manus från kunder används.

Två underlag har olika syften:

- Ursprungliga SV/EN-litterära fragment för negation, agens, återkommande namn, dialog, rytm och senare återkoppling. Förväntningarna är författade testhypoteser och kräver tvåspråkig kalibrering. Befintliga `evaluation-corpus.ts` innehåller dessutom balanserade rena/felplanterade kandidater i SV↔EN.
- Ett 24-kapitels stressmanus med unika markörer, upprepade stycken och kapitel över batchgränsen. Detta provar batchning, bevarad ordning, återspelning och fullständighet; repetitionen gör det olämpligt som litterärt kvalitetsbevis. Riktigt längre manus kräver rättighetsklarerat material och separat godkänt prov.

## Acceptans och bevis

Maskinprov: inga tappade/dubbla kapitel eller segment, samma språk-/editions-ID efter omladdning, originalets fingerprint oförändrat, alla rapporter bundna till källa/mål, kritiska/major-fynd blockerar automatisk kvalitetsmarkering, sena svar från tidigare språk förkastas. Planterade fel ska upptäckas och rena kontrollpassager ska inte skrivas om utan skäl. Bevara rubriker, stycken, dialog, siffror, namn och HTML-escaping. En lyckad schema-/batchkontroll ska aldrig räknas som godkänd översättning.

Mänsklig granskning: minst en oberoende tvåspråkig litterär granskare per språkpar; granska början/mitt/slut samt alla planterade riskpassager utan att först se maskinens dom. Ange bedömare, språkvariant, datum, källfingerprint, målfingerprint, modell/prompt/rubricversion, exakta citat/positioner och rättningsbeslut. Bedöm trohet, idiom, författarröst, rytm, dialog och kontinuitet 1–5. Föreslagen acceptans är noll kvarvarande critical/major-fel, minst 4/5 i varje dimension och uttryckligt mänskligt godkännande av vald variant. Detta är provkriterier, inte ett fastställt lanseringsavtal.

Alla språk har `not_run` för nya providerprov och `not_reviewed` för mänsklig litterär granskning. Det tidigare korta EN→SV-produktionsprovet finns i `/Users/admin/Documents/Verkli/Beta-journey-2026-09-20/REPORT.md`; det gäller inte hela matrisen eller långa böcker.

## Avgränsat framtida betalt prov

Förslag, inte godkännande: börja med ett valt språkpar och högst 4 000 källtecken, en granskad körning, högst 7 modellanrop (profil + första översättning + två granskare + en rättning + två omgranskningar), inga automatiska omförsök eller andra språk. Stoppa innan provideranrop om den befintliga budgetreserveringen inte ryms. Manifestet anger konservativa interna reservationsenheter; dessa är INTE valuta eller faktiska tokenkostnader. Dollar-/kronetak måste räknas från aktuell modellprissättning och uttryckligen godkännas före en körning. Ingen sådan körning har gjorts här. Ett fullmanusprov ska få eget kostnadsförslag och separat godkännande.

Känd separat kvalitetsrisk från releaseägaren: befintlig editorial critic får endast måltext i translation-läge, inte källtext/mode. Den kan därför inte säkert avfärda semantiska fynd. Fryst kostnadspaket ägs av support/drift; framtida kvalitetsfix måste samordna källkontext med budgetestimatorn. Sparade-jämförelsepaketet ändrar inte critic och ger ingen ny kvalitetsgaranti.
