# Separat paket för holländsk och polsk text

Den namngivna v1-listan i originalspecifikationen omfattar holländska och polska. Detta paket gör `nl` och `pl` till centralt valbara textspråk med namn, SEO-etiketter och bibehållen editionsnormalisering. Befintliga API-valideringar/worker använder samma lista och befintlig Anthropic-routing stöder båda språkparen. Inga nya modellleverantörer eller dependencies införs. Befintliga tolv språk bevaras i samma ordning.

Detta är teknisk tillgänglighet, inte mänskligt godkänd kvalitet. Ingen holländsk/polsk översättning har körts med verklig provider i paketet. Automatisk heuristisk språkidentifiering utökas inte; nya editioner måste ha uttrycklig språkmetadata. Den typade heuristiklistan kompletteras därför endast med tomma kandidatlistor, utan att ändra tidigare poäng eller språkbeslut.

## Integrationsvillkor

**Integrera inte denna centrala liständring ensam.** Ljudspårets separata kapabilitetsskydd för nl/pl måste ingå i samma integrerade version: tydlig information om att ljud inte är tillgängligt samt serveravslag före checkout/debitering. Befintliga språks ljudbeteende ska bevaras. Ägare: uppgift Färdigställ ljudbok röster och textsynk (01a0c892-ba55-7c42-9447-d272736d34a2). Ljudguardens commit och egen QA redovisas av den ägaren. Detta paket ändrar inga ljud- eller betalningsfiler.

## Lokal kontroll

1. Öppna `/dev/translation-studio`, välj Dutch respektive Polish i Target language. Kontrollera språkets namn i den sparade jämförelsen och förhandsvisningsvalet.
2. Öppna Take your book further. Varje språk ska visas exakt en gång; välj/avmarkera båda. Originalspråket förblir avstängt.
3. Kontrollera med mockat API att ett `nl`-/`pl`-jobb behåller valt sourceVersionId och målspråk; okända språk avvisas fortfarande. Normalisering av en sådan sparad edition får aldrig falla tillbaka till English.
4. I den samlade versionen med ljudguard: öppna nl/pl i Audio. Otillgänglighetscopy ska visas och ingen checkout/preview/generate får starta. Prova samma endpoints direkt; avslag före betalning/provider. Detta steg kräver ljudspårets paket och är inte styrkt av endast denna textpatch.
5. Återprova ett befintligt språk utan provideranrop. Menyer/normalisering ska vara oförändrade. Verklig litterär kvalitetsgranskning följer språkmatrisens separata protokoll.
