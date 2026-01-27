This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) – your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


### Runway text→video

Kör från **`apps/web`** (eller `cd apps/web` om du är i repo-root).

**API** – `POST /api/ai/text-to-video` (Content-Type: application/json):

- `promptText` – **obligatorisk** text som beskriver videon (1–1000 tecken)
- `duration` – 4, 6 eller 8 sekunder (default 6)
- `ratio` – t.ex. `"1280:720"`, `"720:1280"`, `"1080:1920"`, `"1920:1080"`
- `audio` – `true`/`false` om videon ska ha ljud (påverkar pris)

Exempel:
```bash
curl -X POST http://localhost:3000/api/ai/text-to-video \
  -H "Content-Type: application/json" \
  -d '{"promptText":"Lugn timelapse med moln som glider över himlen."}'
```

**CLI** – `npm run runway:text-to-video`. Använd env (t.ex. i `.env.local`):

- `RUNWAY_PROMPT_TEXT` – egen prompt (default: cinematic 5‑sec shot)
- `RUNWAY_DURATION` – 4, 6 eller 8
- `RUNWAY_RATIO` – t.ex. `1280:720`
- `RUNWAY_AUDIO` – `1` eller `true` för ljud

**Var hittar jag videorna?** De sparas inte i en mapp. Runway returnerar **länkar** (URL:er) i svaret. CLI skriver ut dem i terminalen efter körning – öppna länken i webbläsaren eller ladda ner filen. API:et returnerar samma URL:er i `output` (array). Länkarna går ut efter en tid.
