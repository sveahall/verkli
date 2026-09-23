# Omslagsexport och lokal återställningsvy

Omslagseditorn kan ladda ned PNG/JPEG i 800×1200 px. Bildladdning och exportfel visas tydligt. En misslyckad uppladdning/bokuppdatering stänger inte editorn eller ersätter senast sparat redigeringsläge. Mobilens exportkontroller får radbrytas. Storleken är inte ett löfte om godkänd tryck-/KDP-fil.

RecoveryPanel har ett injicerat list/restore-kontrakt och en utvecklingsvy med syntetiska manus. Listning, förhandsvisning, bekräftelse, laddning, tomt, fel och konflikt kan provas. Den saknar produktionsadapter. Nuvarande bok-/kapitelradering är permanent och denna leverans ändrar inte den. Full kapitelhistorik och kapitelillustrationernas gemensamma stilprofil återstår.

Originalspecifikationens Bilaga 1 §3.4.1 kräver PNG/JPG och manuell omslagskontroll; §3.4.2 beskriver kapitelillustrationer och stilprofil. Kravet på versionshantering av AI-resultat ger inte i sig en historiktabell. Den senare checklistans rad23 och arbetsplanen beställer papperskorg. Databasförslaget lämnas separat för beslut; inga migrationer/dependencies tillkommer.

## Lokal QA

Starta appen med installerade dependencies och Node≥22.12. För fixtureprov räcker lokala dummyvärden; kopiera inte produktionsnycklar:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon NEXT_PUBLIC_WAITLIST_ONLY=false NEXT_PUBLIC_SITE_URL=http://localhost:3067 npm run dev -w @verkli/web -- --port 3067
```

1. Öppna `/dev/book-recovery`. Läs fixturemarkeringen och välj The lighthouse. Granska texten före bekräftelse.
2. Välj Simulate concurrent edit och återställ. Bekräfta konflikt, ladda om listan, återställ boken som privat och därefter kapitlet The keeper. Texten ska vara oförändrad.
3. Återställ Earlier opening: upptagen kapitelposition ska stoppa försöket. Byt konto: listan ska vara tom. Växla Service failure och prova återhämtning.
4. Öppna `/dev/cover-editor`, aktivera Simulate save failure och öppna editorn. Lägg till/ändra ett titellager, ladda ned både PNG och JPEG. Filerna ska öppnas som 800×1200-bilder.
5. Spara med aktivt simulerat fel: editorn och textlagret ska finnas kvar. Stäng, stäng av felet och prova syntetisk sparning. Prova därefter saknad bild: Save/Download ska vara spärrade.
6. Upprepa på 390 px; Save, Close och Download ska ligga inom skärmen. Produktions-/testmiljö ska neka båda `/dev/`-sidorna via notFound.

## Automatiska kontroller

Riktat kommando:

```sh
npm test -w @verkli/web -- src/app/dev/book-recovery src/app/dev/cover-editor src/components/books/cover-editor 'src/app/(app-author)/author/books/[id]/editor/hooks/useBookCover.save.test.tsx'
```

19 tester passerade, inga överhoppade i det riktade paketet. Två sparfelsregressioner var röda före korrigeringen. `e2e/book-tools.spec.ts` provar desktop/mobil med riktig browser och kontrollerar exporterade filers signaturer, filnamn, storlek, knapparnas viewportgränser och att textlager bevaras. Den använder enbart lokala fixtures; inte skarp Supabase, AI eller uppladdning.

Extern rapportmapp: `/Users/admin/Documents/Verkli/Fardigstallande-2026-09-22/bokverktyg/`. Där finns uppdaterad STATUS, UI-loggar/skärmbilder, SPEC-INVENTORY och DATABASE-PROPOSAL. Fullcheckresultat och commit/PR dokumenteras där efter samordnad körning. Integrerat/Live/Slutprovat är separata statusfält.
