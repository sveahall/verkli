# No-placeholder guard

Ingen sida får rendera fejkade cards, hardcoded listor eller placeholder-innehåll som ser verkligt ut.

## Script

Kör från `apps/web`:

```bash
npm run check:no-placeholders
```

Scriptet använder `rg` (ripgrep) mot `apps/web/src` och **failar** om något av följande hittas:

- **PlaceholderPage** – användning av placeholder-komponenten (filen `PlaceholderPage.tsx` exkluderas)
- **coming soon** – text som lovar innehåll senare
- **lorem** – lorem ipsum eller liknande
- **This page is a placeholder** – standard placeholder-text

Testfiler (`*.test.*`) exkluderas.

Vid träff skrivs felmeddelande och exit code 1.

## Vid ny utveckling

- Om data saknas: visa **empty state** med tydlig CTA.
- Om routen inte ska finnas: returnera **404** eller **redirect**.
- Använd inte PlaceholderPage, mock-listor eller hårdkodade cards som ser verkliga ut.
