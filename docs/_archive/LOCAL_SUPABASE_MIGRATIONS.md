# Lokal körning av Supabase-migrations

## Canonical migrationskälla
- Canonical: `apps/web/supabase/migrations`
- `packages/db/supabase/migrations` innehåller legacy/markeringsmigrations och ska inte användas som primär schemakälla.

## Förkrav
- Docker Desktop (eller kompatibel Docker-daemon) är igång.
- Kör kommandon från `apps/web` så att `apps/web/supabase/config.toml` används.

## Starta lokal Supabase
```bash
cd /Users/admin/verkli-web/apps/web
npx supabase start
```

## Applicera alla migrations lokalt (rekommenderad, deterministisk)
`config.toml` har seed aktiverat men `apps/web/supabase/seed.sql` saknas, så använd `--no-seed`.

```bash
cd /Users/admin/verkli-web/apps/web
npx supabase db reset --local --no-seed
```

## Applicera endast pending migrations lokalt
```bash
cd /Users/admin/verkli-web/apps/web
npx supabase migration up --local
```

## Skapa ny migration
```bash
cd /Users/admin/verkli-web/apps/web
npx supabase migration new <beskrivande_namn>
```

Detta skapar en ny fil i `apps/web/supabase/migrations/`.

## Verifiera att tabell-definitioner inte är dubblerade
Exempelkontroll för centrala tabeller:

```bash
cd /Users/admin/verkli-web
rg -n -i "create table .*billing_accounts|create table .*stripe_events|create table .*user_credits|create table .*donations|create table .*credit_topups|create table .*credit_grants|create table .*book_clubs|create table .*polls" apps/web/supabase/migrations packages/db/supabase/migrations
```

Förväntat efter konsolidering: en `CREATE TABLE`-definition per tabellnamn i ovan grep.
