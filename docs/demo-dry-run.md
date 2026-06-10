# Investor-demo: dry-run-manus

Klick-för-klick-manus för pitchen, med fallback-beslut inbakade. Skrivet för
torsdagens författar-/investerarmöte men återanvändbart för varje framtida
pitch. Mål-tid: under 3 minuter för golden path.

## Före mötet (en gång, på pitch-laptopen, MED nät)

1. **Starta servern själv i terminalen:** `npm run dev` (port 3000 måste vara
   ledig — `pkill -f "next dev"` om en gammal lever).
2. **Env-koll:** flaggor läses från `apps/web/.env.local` (INTE root-filen).
   `NEXT_PUBLIC_DISCOVERY_ENABLED=true` krävs för Discover. Efter env-ändring:
   `rm -rf apps/web/.next` + starta om (NEXT_PUBLIC bakas in vid kompilering).
3. **Logga in som demo-författaren** och slå på demo-läget
   (dev-knappen nere till vänster → `POST /api/dev/toggle-demo-mode`).
4. **Värm service worker-cachen** — besök i ordning, MED nät:
   - `/author/books/6abdd304-7bc3-41a1-a841-4bf764621ac3?panel=cover`
   - samma bok `?panel=production` och `?panel=distribute`
   - `/reader/books/6abdd304-7bc3-41a1-a841-4bf764621ac3` (reader-finalen)
   Detta fyller demo-SW:ns runtime-cache så boksidorna överlever wifi-tapp.
   Besök även `/reader/discover` för att verifiera att den funkar — men OBS:
   Discover SW-cachas INTE (demo-SW täcker bara demo-assets + boksidor), så
   den kräver nät vid varje förstaladdning.
5. **Nollställ allt demo-state:** `Cmd+Shift+R` (rensar demo-localStorage,
   inkl. per-bok cover-state, och laddar om). Kör detta före VARJE rehearsal
   så varje genomkörning startar identiskt.
6. **Live cover-generering — VERIFIERAD 2026-06-10:** direkttest mot
   `/cover/generate` gav 200 med 4 bilder på ~11 s via flux.1-schnell
   (ingen failover behövdes). Klicka ändå Generate en gång som sanity-
   check på pitch-laptopen. Felar live tidigt hålls loadern minst 8 s
   innan fallback-covers visas; hänger live tar fallbacken över vid 15 s-
   timeouten. Oavsett väg visas "Generated just now". Avgör nedan vilket
   Generate-läge du kör.
7. **Beslut: Generate-läge.** Två giltiga val — välj FÖRE mötet och öva på det:
   - **Anticipation (default):** live-försök med 8 s-loader och fasade
     statustexter. Mest teater, kräver inget.
   - **Degraded (`Cmd+Shift+D`):** hoppar över live-anropet, fallback-covers
     landar direkt. Välj denna om venue-wifit är dåligt eller om steg 6
     visade att live-vägen inte funkar.

## Golden path (under mötet — sikta på < 3 min)

| Steg | Gör | Säg (kärnan) | Hotkey |
|---|---|---|---|
| 1 | Öppna boken på cover-panelen | "Från manus till färdig bok — börja med omslaget" | `1` |
| 2 | Klicka **Generate cover** → 4 varianter landar | "Fyra omslag från titel, synopsis och genre — på sekunder" | — |
| 3 | Klicka en variant → **Use as cover** | "Författaren väljer, klart" | — |
| 4 | Gå till Production | "Ljudbok + 10 språk, samma knapp" | `2` |
| 5 | Spela en ljudbok-snutt (valfritt språk) | "Genererad uppläsning på tio språk" | — |
| 6 | Gå till Distribution (öppnar POD-modal) | "Marknadsföring per kanal + print on demand" | `3` |
| 7 | Hoppa till reader-finalen | "Och så här möter läsaren boken" | `5` |
| 8 | Scrolla hero → spela uppläsning → visa språkvälj | "Skrivet → upptäckt → läst. Hela kedjan." | — |

Avsluta i lugn: stanna på reader-finalen, inte i författar-UI:t.

## Fallbacks (om något går fel LIVE)

| Symptom | Gör direkt | Varför det funkar |
|---|---|---|
| Generate hänger eller felar | Vänta — fallbacken tar över automatiskt (vid tidigt fel efter 8 s-loadern, vid häng vid 15 s-timeouten) med "Generated just now"-badge | Inbyggd race: live mot 15 s-timeout, 8 s minimum-loader på felvägen |
| Wifi dör mitt i | Fortsätt — covers/audio/social-SVG:er är SW-cachade; boksidorna serveras stale | Demo-SW (v3) servar precache offline |
| Wifi dör FÖRE editorn öppnats | Öppna inte nya osedda sidor; håll dig till de cache-värmda | Editor-första-laddning kräver Supabase |
| Sidan i konstigt state | `Cmd+Shift+R` (reset + reload) — ta om steget | Nollar allt demo-state inkl. cover |
| Total katastrof (inget renderar) | `Cmd+Shift+V` — backup-video i fullskärm | Förinspelad genomkörning |

**Minnesregel:** `D` = degraded, `V` = video, `R` = reset. Siffror = navigation.

## Kända begränsningar (var ärlig om någon frågar)

- **Editor + Discover kräver Supabase vid FÖRSTA sidladdning** (ingen offline-
  fallback i den vägen). Mitigering = cache-värmningen ovan + håll sidorna
  öppna i flikar.
- **Discover-katalogen är tunn** (medvetet beslut: en djup demo-bok i stället
  för fejkad bredd). Visa Discover snabbt eller hoppa över den i golden path.
- **Live-generering träffar NVIDIA:s API** — kvaliteten på flux.1-schnell-
  covers är ny sedan endpoint-bytet; godkänn dem visuellt i steg 6 ovan
  innan du litar på live-läget i skarpt läge.

## Rehearsal-checklista (kör HELA två gånger före torsdag)

- [ ] Genomkörning 1: med nät, anticipation-läge, ta tid (< 3 min?)
- [ ] Genomkörning 2: **wifi AV** efter cache-värmning — överlever hela vägen?
- [ ] `Cmd+Shift+R` mellan varje — startar allt identiskt?
- [ ] Backup-videon (`Cmd+Shift+V`) spelar och ser aktuell ut?
