Main app lives in `apps/web`. You can run it from repo root with `npm run dev` or directly from `apps/web`.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local Qwen Audiobook (dev)

Audiobook-generation körs via `POST /api/books/[id]/audiobook/generate` och worker `scripts/audiobook-worker.ts`.

1. Sätt env i `apps/web/.env.local`:
   - `REDIS_URL=redis://localhost:6379`
   - `QWEN_TTS_PYTHON=/abs/path/to/qwen3tts-env/bin/python3.12`
   - `QWEN_TTS_SCRIPT=/abs/path/to/apps/web/scripts/qwen_tts_synthesize.py`
   - `AI_NARRATOR_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
   - `AUDIOBOOK_STORAGE_BUCKET=audiobooks`
2. Starta Redis:
```bash
docker compose up -d redis
```
3. Starta app + worker:
```bash
npm run dev
npm run audiobook-worker
```
4. Trigga generation:
```bash
curl -X POST "http://localhost:3000/api/books/<BOOK_ID>/audiobook/generate" -H "Cookie: <session-cookie>"
```

### TTS benchmark (RTF + throughput)

Kör benchmark med kort/medium/lång text:

```bash
npm run tts:bench
```

Vanliga optimeringsflaggor:

- `TTS_DTYPE=auto|bf16|fp16|fp32`
- `TTS_TORCH_COMPILE=1` (valfritt, fallbackar automatiskt vid fel)
- `TTS_INT8=1` (valfritt, default av)
- `QWEN_TTS_BATCH_SIZE=1..8`
- `TTS_CONCURRENCY=1..4` (worker-jobb)

## Runway text→video

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

## Stripe subscriptions (Plus/Pro)

### Required server env vars

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_PLUS`
- `PRICE_PRO`
- `STRIPE_CUSTOMER_PORTAL_RETURN_URL`
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`

### Billing API

- `POST /api/billing/checkout` → starts Stripe Checkout in `subscription` mode (`plan: plus|pro`)
- `POST /api/billing/portal` → opens Stripe Customer Portal (creates customer if missing)
- `GET /api/billing/state` → returns current billing state for signed-in user

### Webhook

- Endpoint: `POST /api/stripe/webhook`
- Runtime: Node.js
- Uses raw request body + Stripe signature verification (`STRIPE_WEBHOOK_SECRET`)
- Idempotency: persisted in `public.stripe_events` via unique `stripe_event_id`
- Updates `public.billing_accounts` with `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `cancel_at_period_end`

### Configure Stripe event subscriptions

Subscribe the webhook endpoint to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
