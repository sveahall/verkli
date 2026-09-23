# Usage metering för beta launch

**Datum:** 2026-09-22
**Status:** Godkänd design
**Mål:** Mäta vad varje användare faktiskt kostar under betan, så att pris för
månadsabonnemang och credit-paket kan sättas på data i efterhand istället för på gissning.

## Problemet

Inget i systemet vet idag vad en användare har kostat.

| Komponent | Verkligt läge |
|---|---|
| `user_credits.token_balance` | Skrivs bara upp via `grant_user_credits_once`. Ingenting drar någonsin av. Saldot är dekoration. |
| `credit_grants`, `credit_topups` | Loggar påfyllning, aldrig förbrukning. |
| `usage_counters` | Tabellen finns i schemat. Noll kod skriver till den. |
| `user_usage_monthly` | Enda kolumnen är `trailer_count_this_month`. |
| Redis-budgetar (`src/lib/workers/budget.ts`) | Dagliga tak i uppskattade "cost-units" (`chars / 4`). Ephemera — nollas, sparas aldrig, uttrycks inte i pengar. |
| `ai_jobs` | Har `input`/`output` JSONB men ingen kostnads- eller tokenkolumn. |
| Providers | `callOpenAi` returnerar `Promise<string>` och kastar bort `usage`-blocket. Ingen provider läser sina egna förbrukningssiffror. |
| `analytics_events` | Produktanalytics, klient-förfalskningsbar (`analytics_events_insert_own`), ej kostnad. |

Redis-budgetarna är ett **tak**, inte en **mätare**. De svarar "fick anropet ske?"
men aldrig "vad kostade det?", och de är designade att glömma.

## Omfattning

**Ingår:** AI-anrop (tokens/tecken/renders + kostnad), storage per användare,
egress/bandbredd, jobb- och aktivitetsmått. Admin-UI med CSV-export.
Full radupplösning nu, hoprullning till dagsaggregat efter 90 dagar.

**Ingår inte (medvetet):** ingen credit-avdragning, inga nya hårda tak, ingen
prissättnings-UI, inga per-användarkvoter. Priset är okänt — att gissa ett tak nu
skulle förorena exakt den data vi samlar in. Befintliga Redis-budgetar står kvar
orörda som skyddsnät.

## Arkitektur

### Valet

| Ansats | Dom |
|---|---|
| **Mätarwrapper per provider** | **Vald.** Ser verkliga `usage`-siffror, fungerar identiskt i Next-routes och i Railway-workers, ingen ny leverantör. |
| Middleware / route-nivå | Förkastad: missar alla fyra Railway-workers, där ljudbok och översättning faktiskt kostar, och route-nivån vet inte antal tokens. |
| Extern AI Gateway (Helicone/Vercel) | Förkastad: täcker inte ElevenLabs eller fal.ai, och lägger en ny leverantör i pengavägen två dagar före launch. |

### Datamodell

Tre nya tabeller. Alla är service-role-only: ingen klient, inte ens en inloggad
författare, får läsa dem.

```sql
usage_events
  id            uuid pk
  user_id       uuid not null references auth.users on delete cascade
  occurred_at   timestamptz not null default now()
  kind          text not null    -- ai_call | storage_snapshot | egress_grant | job
  provider      text             -- openai | anthropic | elevenlabs | fal | supabase
  model         text
  pipeline      text             -- tts | translation | video | editorial | cover | assistant | import
  quantity      bigint not null  -- rå enhet, se `unit`
  unit          text not null    -- input_tokens | output_tokens | chars | renders | bytes | ms
  cost_usd      numeric(12,6)
  price_version text             -- vilken rad i usage_price_book som användes
  book_id       uuid references books on delete set null
  job_id        uuid references ai_jobs on delete set null
  request_id    text             -- providerns id, för avstämning mot deras faktura
  meta          jsonb not null default '{}'

usage_daily                      -- user × dag × pipeline × unit
  user_id, day, pipeline, provider, unit
  quantity_sum bigint, cost_usd_sum numeric(12,6), event_count int
  primary key (user_id, day, pipeline, provider, unit)

usage_price_book                 -- versionerad pristabell
  version, provider, model, unit, usd_per_unit, effective_from, effective_to
```

Ett AI-anrop ger **två** rader när providern skiljer på in- och utdata
(`input_tokens` och `output_tokens` har olika pris). Det är avsiktligt: en enda
rad med en blandad "tokens"-siffra går inte att prissätta om när priserna ändras.

**Rå enhet sparas alltid, inte bara kronor.** Har vi `input_tokens: 41203` kan
historiken prissättas om när OpenAI justerar listan. Har vi bara
`cost_usd: 0.41` är siffran död.

### Mätpunkter

Varje provider-funktion tar ett nytt, **valfritt** `meter?: MeterContext`-fält.
Saknas det mäts ingenting — så scripts, seeds och tester påverkas inte, och inga
befintliga anropssignaturer bryts.

```ts
type MeterContext = {
  userId: string;
  pipeline: Pipeline;
  bookId?: string | null;
  jobId?: string | null;
};
```

| Yta | Fil | Mätning |
|---|---|---|
| OpenAI | `src/lib/ai/providers/openai.ts` | `usage.input_tokens` / `usage.output_tokens` ur Responses-svaret. |
| Anthropic | `src/lib/ai/providers/anthropic-translator.ts` | `usage.input_tokens` / `usage.output_tokens`. |
| ElevenLabs | `src/lib/tts/elevenlabs-tts-provider.ts` | Tecken, mätt som `text.length` (finns redan som `inputLength` i `metadata`). ElevenLabs fakturerar på inskickade tecken, så indata är den auktoritativa enheten — ingen gissning behövs ur svaret. |
| fal.ai | `src/lib/fal-image.ts` | Renders (antal bilder), plus `requestId` för fakturaavstämning. |
| Editorial | `src/lib/editorial/provider.ts` | Ärver mätning från OpenAI/Anthropic-lagret; sätter bara `pipeline: "editorial"`. |
| Storage | Ny cron | Listar varje bucket, summerar bytes per ägare → en `storage_snapshot`-rad per user och dag. |
| Egress | De 6 `createSignedUrl`-anropen | Loggar filstorlek + user vid utfärdande (se nedan). |
| Jobb | `ai_jobs`-avslut | Kind, varaktighet, status, kötid. |

### Egress: en kalibrerad proxy, inte en mätning

Alla filer serveras med `createSignedUrl()` följt av en 302-redirect. Bytesen går
Supabase → webbläsare och rör aldrig vår server. **Exakt egress är arkitektoniskt
omätbar från appen.** Att strömma ljudet genom Next.js skulle ge exakta bytes och
samtidigt flytta hela ljudtrafiken in i Railways compute-räkning — botemedlet
vore dyrare än sjukdomen.

Istället: logga *utfärdad* egress (`egress_grant`, filstorlek i bytes) per
användare, och hämta den sanna totalen från Supabase billing. Proxyn fördelar
totalen proportionellt mellan användare.

Detta **överskattar** (en utfärdad URL används kanske aldrig) och **underskattar**
(en URL kan bära flera range-requests). Den är därför en *fördelningsnyckel*, inte
en faktura, och admin-UI ska märka den som uppskattad. Detta är känt och accepterat.

### Felhantering

Mätaren är fire-and-forget och får **aldrig** fälla ett AI-anrop. Skrivningen sker
efter att provider-svaret returnerats; ett fel går till Sentry, aldrig till
användaren. En trasig mätare ska ge saknad data, inte ett trasigt flöde.

Saknas `usage` i svaret (äldre modell, oväntat format) skrivs raden ändå med
`quantity: 0` och `meta.usage_missing: true`, så att tysta hål syns i admin-UI
istället för att se ut som noll förbrukning.

## Admin-UI — `/admin/usage`

Bredvid befintliga `/admin/metrics` och `/admin/queues`, bakom `checkAdmin()`.

- **Per användare** — topplista: kostnad denna månad, storage, uppskattad egress, jobb.
- **Per pipeline** — vad som faktiskt bränner pengar.
- **Över tid** — kostnad per dag, staplad per pipeline.
- **CSV-export** — rådata ut, för prissättningen görs i kalkylark.

Läser `usage_daily`, inte `usage_events`, så sidan är snabb även när
radantalet växer.

## Hoprullning

Nattlig cron: aggregera gårdagens `usage_events` in i `usage_daily`, och radera
`usage_events` äldre än 90 dagar. `usage_daily` behålls för alltid — den är liten.

## Testning

TDD per mätpunkt.

- Wrapper-enhetstester med fejkade provider-svar, **inklusive svar utan `usage`-block**.
- Prissättningstester mot `usage_price_book`, inklusive versionsskifte mitt i en period.
- Test att ett mätarfel inte propagerar till anroparen.
- RLS-test: anon och inloggad författare får noll rader från alla tre tabellerna.
- Migrationsverifiering mot live-DB. Repots migrationer har ljugit förut: en grön
  `migration list` bevisar att liggaren är överens, inte att schemat ändrats.
- `npx tsc --noEmit` från `apps/web` — `npm run build` typkollar inte testfiler.

## Byggordning

Levereras i den här ordningen så att något användbart finns även om inte allt hinns:

1. Migration + price book + mätarmodul
2. AI-mätning på de fem providrarna ← *ensam ~80% av prissättningsunderlaget*
3. Jobb- och aktivitetsmått
4. Storage-snapshot-cron
5. Egress-loggning
6. `/admin/usage` + CSV
7. Hoprullnings-cron
