# Verkli — Beta Launch Plan

## TLDR

10 epics, prioriterade P0/P1. Allt handlar om att slutföra befintliga flöden, inte bygga nytt. Varje epic har user story, acceptance criteria, demo script och definition of done. Inkluderar beta freeze list och en 30-minutters QA-checklista som täcker hela plattformen.

---

## Epics Overview

| # | Epic | Prioritet | Flöde |
|---|------|-----------|-------|
| 1 | Author: Create & Publish Book | P0 | Author |
| 2 | Editor Stability | P0 | Author |
| 3 | Reader: Browse, Search & Read | P0 | Reader |
| 4 | Reading Progress & Bokhylla | P0 | Reader |
| 5 | Audiobook Playback | P0 | Reader |
| 6 | Auth & Sessions | P0 | Platform |
| 7 | Billing & Plus Subscription | P0 | Monetisering |
| 8 | Freemium Gate | P0 | Monetisering |
| 9 | Jobs: Translation & Audiobook | P1 | Platform |
| 10 | Error Handling & Polish | P1 | Platform |

---

## Epic 1 — Author: Create & Publish Book

**Prioritet:** P0

**User Story:**
Som författare vill jag kunna skapa en bok, lägga till kapitel, och publicera den — så att läsare kan hitta och läsa mitt verk.

**Acceptance Criteria:**
- [ ] Author kan skapa ny bok med titel, beskrivning och omslag
- [ ] Author kan lägga till, ta bort och ordna om kapitel
- [ ] Author kan publicera boken med ett klick
- [ ] Publicerad bok syns i browse/sök inom 60 sekunder
- [ ] Author kan redigera en redan publicerad bok och ändringar slår igenom live
- [ ] Author kan avpublicera en bok
- [ ] Hela flödet (signup → publicerad bok) tar ≤15 minuter

**Demo Script:**
1. Logga in som ny author
2. Klicka "Create Book" → fyll i titel, beskrivning, ladda upp omslag
3. Lägg till 3 kapitel med text
4. Ordna om kapitel 2 och 3
5. Klicka "Publish"
6. Öppna ett nytt fönster som reader → sök på bokens titel → verifiera att boken syns
7. Gå tillbaka som author → redigera kapitel 1 → verifiera ändringen syns för reader

**Definition of Done:**
- Alla acceptance criteria passerar
- Inga dead ends i flödet (varje steg har tydlig nästa-action)
- Fungerar på desktop Chrome och Safari
- Mobilresponsivt (kan slutföras på telefon)

---

## Epic 2 — Editor Stability

**Prioritet:** P0

**User Story:**
Som författare vill jag kunna skriva och redigera långa texter utan att förlora mitt arbete — så att jag kan lita på plattformen med mitt manuskript.

**Acceptance Criteria:**
- [ ] Editor hanterar 50 000+ ord utan märkbar lagg
- [ ] Autosave triggas var 30:e sekund
- [ ] Synlig save-indikator (sparad / sparar / ej sparad)
- [ ] Om nätverket bryts: innehållet bevaras lokalt och synkas när uppkoppling återkommer
- [ ] Copy/paste från Word/Google Docs bevarar grundläggande formatering
- [ ] Undo/redo fungerar korrekt

**Demo Script:**
1. Öppna en bok med 20 kapitel / 30 000 ord
2. Navigera mellan kapitel — verifiera ingen lagg
3. Skriv 3 stycken → verifiera autosave-indikator
4. Stäng fliken utan att spara manuellt → öppna igen → verifiera att texten finns kvar
5. Klistra in 2 000 ord från Word → verifiera formatering
6. Undo 5 gånger → redo 3 gånger → verifiera korrekt state

**Definition of Done:**
- Stresstestade med 50k ord utan krasch eller dataförlust
- Save-indikator synlig och korrekt i alla states
- Ingen rapporterad dataförlust under testperiod

---

## Epic 3 — Reader: Browse, Search & Read

**Prioritet:** P0

**User Story:**
Som läsare vill jag kunna hitta böcker, öppna dem och läsa dem bekvämt — så att jag har en anledning att använda plattformen.

**Acceptance Criteria:**
- [ ] Browse-sida visar publicerade böcker med omslag, titel, författare
- [ ] Sök returnerar relevanta resultat inom 2 sekunder
- [ ] Klick på bok → öppnar läsvyn med kapitelnavigering
- [ ] Läsvyn renderar text korrekt utan layout-buggar
- [ ] Fungerar desktop + mobil
- [ ] Sidladdning <2 sekunder på alla core-sidor

**Demo Script:**
1. Öppna Verkli som utloggad besökare → se browse-sida
2. Sök på en bokttitel → verifiera relevanta resultat
3. Klicka på en bok → verifiera att läsvyn öppnas
4. Navigera mellan kapitel med kapitelmenyn
5. Skrolla genom ett långt kapitel → verifiera rendering
6. Byt till mobilvy (responsive) → upprepa steg 3–5

**Definition of Done:**
- Inga tomma states (alltid fallback om inga resultat)
- Inga rendering-buggar i läsvyn med standardtext
- <2s load time på browse, sök och läsvy

---

## Epic 4 — Reading Progress & Bokhylla

**Prioritet:** P0

**User Story:**
Som läsare vill jag kunna spara böcker och återkomma till rätt ställe — så att jag har en anledning att komma tillbaka till plattformen.

**Acceptance Criteria:**
- [ ] Reader kan spara en bok till sin bokhylla
- [ ] Bokhyllan visar alla sparade böcker med omslag
- [ ] Läsprogress sparas automatiskt (kapitel + scroll-position)
- [ ] Stäng webbläsaren → öppna igen → exakt rätt position
- [ ] Progress syncs mellan enheter (desktop → mobil)
- [ ] Reader kan ta bort en bok från bokhyllan

**Demo Script:**
1. Logga in som reader → öppna en bok → läs till kapitel 3, mitt i texten
2. Stäng fliken helt
3. Öppna Verkli igen → gå till bokhyllan → klicka på boken
4. Verifiera: öppnas på kapitel 3, rätt scroll-position
5. Öppna samma bok på en annan enhet → verifiera samma position
6. Ta bort boken från bokhyllan → verifiera att den försvinner

**Definition of Done:**
- Progress sparas persistent (inte bara session)
- Fungerar cross-device
- Bokhylla renderar korrekt med 0, 1 och 50+ böcker

---

## Epic 5 — Audiobook Playback

**Prioritet:** P0

**User Story:**
Som läsare vill jag kunna lyssna på en bok som audiobook — så att jag kan konsumera innehåll på språng.

**Acceptance Criteria:**
- [ ] Play/pause fungerar utan fördröjning
- [ ] Progress-bar visar korrekt position
- [ ] Kan hoppa framåt/bakåt (30s eller kapitelvis)
- [ ] Spelaren fortsätter vid rätt position efter page reload
- [ ] Ljudkvalitet är jämn utan artefakter
- [ ] Kapitelnavigering i spelaren

**Demo Script:**
1. Öppna en bok som har audiobook
2. Tryck play → verifiera ljud startar
3. Pause → play → verifiera att det fortsätter rätt
4. Hoppa till nästa kapitel → verifiera korrekt
5. Stäng fliken → öppna igen → verifiera att position bevaras
6. Spela 5 minuter kontinuerligt → lyssna efter artefakter

**Definition of Done:**
- Ingen krasch eller tyst failure vid uppspelning
- Position bevaras mellan sessioner
- Testat med minst 3 olika böcker

---

## Epic 6 — Auth & Sessions

**Prioritet:** P0

**User Story:**
Som användare vill jag kunna skapa konto, logga in och förbli inloggad — så att min data och mina böcker finns kvar.

**Acceptance Criteria:**
- [ ] Signup med email + lösenord fungerar
- [ ] OAuth signup/login (Google) fungerar
- [ ] Login fungerar med korrekt felmeddelande vid fel lösenord
- [ ] Lösenordsåterställning via email fungerar end-to-end
- [ ] Session håller i minst 7 dagar utan omlogin
- [ ] Utloggning rensar session korrekt

**Demo Script:**
1. Gå till signup → skapa konto med email
2. Logga ut → logga in igen
3. Stäng webbläsaren → öppna → verifiera fortfarande inloggad
4. Klicka "Forgot password" → följ flödet → sätt nytt lösenord → logga in
5. Testa OAuth-login med Google

**Definition of Done:**
- Inga sessionsläckor (utloggad user ser inte skyddat content)
- Lösenordsåterställning fungerar inom 5 min
- Inga krypterade lösenord i klartext någonstans

---

## Epic 7 — Billing & Plus Subscription

**Prioritet:** P0

**User Story:**
Som läsare vill jag kunna betala för Plus-prenumeration — så att jag får tillgång till allt content.

**Acceptance Criteria:**
- [ ] Tydlig "Upgrade to Plus" CTA synlig från freemium-gate
- [ ] Stripe checkout öppnas korrekt
- [ ] Efter betalning: Plus-status aktiveras omedelbart
- [ ] Plus-content blir tillgängligt direkt efter betalning
- [ ] User kan se sin prenumerationsstatus i settings
- [ ] Avsluta prenumeration → access kvar till periodens slut → sen nedgraderad

**Demo Script:**
1. Logga in som gratis reader
2. Nå freemium-gräns → se upgrade CTA
3. Klicka → Stripe checkout → genomför testbetalning
4. Verifiera: Plus-badge syns, premium content tillgängligt
5. Gå till settings → se prenumerationsstatus
6. Avsluta prenumeration → verifiera att access finns kvar till periodens slut

**Definition of Done:**
- End-to-end betalflöde fungerar med Stripe test-mode
- Inga states där user betalar men inte får access
- Cancelleringsflöde testat

---

## Epic 8 — Freemium Gate

**Prioritet:** P0

**User Story:**
Som plattform vill jag begränsa gratis-readers tillgång — så att vi driver konvertering till Plus utan att skrämma bort nya users.

**Acceptance Criteria:**
- [ ] Tydlig och icke-frustrerande gräns (ex: X kapitel/månad eller X böcker)
- [ ] Gate visar vad user får med Plus (value prop)
- [ ] Gate blockerar INTE mitt i en mening/sida
- [ ] Gratis-users kan alltid läsa minst 1 hel bok / signifikant mängd content
- [ ] Gränsen kan justeras via config utan kodändring

**Demo Script:**
1. Logga in som gratis reader
2. Läs tills freemium-gränsen nås
3. Verifiera: gate visas med tydligt meddelande och upgrade CTA
4. Verifiera: gate-texten kommunicerar vad Plus ger
5. Klicka "Maybe later" → verifiera att user kan fortsätta browse men inte läsa ny premium content
6. Uppgradera → verifiera att gate försvinner

**Definition of Done:**
- Gränsen konfigurerad och dokumenterad
- Gate aldrig visas mitt i läsning (alltid vid naturlig brytpunkt)
- Upgrade CTA leder direkt till billing-flöde (Epic 7)

---

## Epic 9 — Jobs: Translation & Audiobook

**Prioritet:** P1

**User Story:**
Som författare vill jag kunna beställa översättning och audiobook-generering av min bok — och följa progress.

**Acceptance Criteria:**
- [ ] Author kan starta translation-jobb från bok-dashboard
- [ ] Author kan starta audiobook-jobb från bok-dashboard
- [ ] Jobbstatus visas: queued → processing → done / failed
- [ ] Vid failure: tydligt felmeddelande + retry-knapp
- [ ] Färdigt jobb: resultat (översatt bok / audiobook) tillgängligt direkt
- [ ] Inga jobb hänger i processing >10 min utan feedback

**Demo Script:**
1. Öppna en publicerad bok som author
2. Starta ett translation-jobb → verifiera status "queued"
3. Vänta → verifiera att status uppdateras till "processing" → "done"
4. Öppna den översatta versionen → verifiera att den finns
5. Starta audiobook-jobb → följ samma verifikation
6. Simulera failure → verifiera felmeddelande och retry-knapp

**Definition of Done:**
- Inga tysta failures (alla errors synliga för author)
- Retry fungerar
- Timeout-hantering finns (jobb som kör >X min flaggas)

---

## Epic 10 — Error Handling & Polish

**Prioritet:** P1

**User Story:**
Som användare ska jag aldrig se en vit sida, kryptiskt felmeddelande eller hamna i en dead end — plattformen ska kännas färdig.

**Acceptance Criteria:**
- [ ] Inga 500-errors på happy path (create, read, pay)
- [ ] 404-sida med navigation tillbaka
- [ ] Alla formulär visar valideringsfel inline
- [ ] Loading states på alla async-operationer
- [ ] Tomt-state för bokhylla, sökresultat, dashboard (aldrig helt tomt)
- [ ] Favicon, sidtitlar och meta-taggar på alla sidor

**Demo Script:**
1. Navigera till en URL som inte finns → verifiera 404-sida
2. Skicka tomt formulär → verifiera inline-felmeddelanden
3. Ladda browse-sida med långsam anslutning → verifiera loading state
4. Öppna tom bokhylla → verifiera empty state med CTA
5. Sök på något som inte matchar → verifiera "inga resultat" state

**Definition of Done:**
- Noll vita sidor på alla testade flöden
- Alla async-operationer har loading indicator
- Alla tomma listor har empty state

---

## Beta Freeze List

**Sista veckan före launch — FÖRBJUDET att ändra:**

| Kategori | Freeze-regel |
|----------|-------------|
| Billing/Stripe | Inga ändringar i betalflöde, pricing, eller subscription-logik |
| Auth | Inga ändringar i login, signup, sessionshantering |
| Editor autosave | Ingen refactor av save-logik |
| Datamodell | Inga DB-migreringar |
| Core routing | Inga URL-ändringar |
| Third-party deps | Inga dependency-uppgraderingar |

**Tillåtet sista veckan:**
- Copy-ändringar (text, labels)
- CSS/styling-justeringar
- Bugfixes som inte rör freeze-listans områden
- Analytics/tracking-tillägg

---

## 30-Minute QA Checklist

> Kör igenom sekventiellt. Stoppa och logga varje fail. Estimerad tid per block i parentes.

### Block 1 — Auth (3 min)
- [ ] Signup med email → verifiera konto skapat
- [ ] Logga ut → logga in → session aktiv
- [ ] Stäng webbläsare → öppna → fortfarande inloggad
- [ ] "Forgot password" → email → nytt lösenord → login fungerar

### Block 2 — Author: Create & Publish (5 min)
- [ ] Skapa ny bok (titel + beskrivning + omslag)
- [ ] Lägg till 3 kapitel med text
- [ ] Ordna om kapitel
- [ ] Publicera boken
- [ ] Verifiera att boken syns i browse/sök (<60s)
- [ ] Redigera publicerad bok → ändring synlig för reader

### Block 3 — Editor (4 min)
- [ ] Öppna bok med 10+ kapitel → navigera utan lagg
- [ ] Skriv text → se autosave-indikator
- [ ] Stäng flik utan manuell save → öppna → text finns kvar
- [ ] Copy/paste från extern källa → formatering bevarad
- [ ] Undo/redo 3 gånger → korrekt state

### Block 4 — Reader: Browse & Read (4 min)
- [ ] Browse-sida laddar med böcker (<2s)
- [ ] Sök på bokstitel → relevanta resultat (<2s)
- [ ] Öppna bok → läsvy med kapitelnavigering
- [ ] Skrolla genom kapitel → korrekt rendering
- [ ] Mobilvy (resize) → läsbar och navigerbar

### Block 5 — Reading Progress & Bokhylla (3 min)
- [ ] Spara bok till bokhylla → syns i bokhyllan
- [ ] Läs till kapitel 3 → stäng → öppna → rätt position
- [ ] Ta bort bok från bokhylla → försvinner

### Block 6 — Audiobook (3 min)
- [ ] Öppna bok med audiobook → play → ljud hörs
- [ ] Pause → play → korrekt position
- [ ] Byt kapitel → korrekt ljud
- [ ] Stäng → öppna → position bevarad

### Block 7 — Billing & Freemium (5 min)
- [ ] Läs som gratis-user → nå freemium-gräns → gate visas
- [ ] Gate visar upgrade CTA + value prop
- [ ] Klicka upgrade → Stripe checkout → genomför testbetalning
- [ ] Plus-status aktiv → premium content tillgängligt
- [ ] Settings → prenumerationsstatus synlig
- [ ] Avsluta → access kvar till periodslut

### Block 8 — Jobs (2 min)
- [ ] Starta translation-jobb → status synlig
- [ ] Starta audiobook-jobb → status synlig
- [ ] Jobbstatus uppdateras (queued → processing → done)

### Block 9 — Error Handling (1 min)
- [ ] Navigera till felaktig URL → 404-sida visas
- [ ] Tom bokhylla → empty state visas
- [ ] Sök utan resultat → "inga resultat" state visas

**Total: ~30 minuter**

**Resultat:**
- 0 fails = Beta ready
- 1–3 fails i P1 epics = Ship med kända issues
- Fails i P0 epics = STOP, fixa först