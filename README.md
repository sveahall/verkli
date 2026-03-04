Main app lives in `apps/web`. Run from repo root or directly from `apps/web`.

## Quick Start

```bash
docker compose up -d redis   # Start Redis for queues
npm run dev                   # Start Next.js dev server
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Gate

```bash
npm run qa:beta   # 7 stages: env → tests → lint → english-default → no-placeholders → dead-code → build
```

All stages must pass before release.

## Workers

Start workers in separate terminals as needed:

```bash
npm run import-worker         # Book import (epub/docx/html/txt)
npm run translate-worker      # Translation (Opus MT, sv↔en)
npm run audiobook-worker      # Audiobook generation (Qwen TTS)
npm run social-publish-worker # Social media publishing
npm run marketing-worker      # Marketing campaign generation
```

See `docs/dev-runbook.md` for full local setup and `docs/workers-runbook.md` for worker operations.

## Stripe Billing

Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_PLUS`, `PRICE_PRO`, `STRIPE_CUSTOMER_PORTAL_RETURN_URL`, `STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL`.

Webhook endpoint: `POST /api/stripe/webhook` — subscribe to `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`.

## Docs

| Doc | Purpose |
|-----|---------|
| `docs/dev-runbook.md` | Local development setup |
| `docs/workers-runbook.md` | Worker operations and monitoring |
| `docs/beta-release-gate.md` | Release criteria and manual QA |
| `docs/ARCHITECTURE_MAP.md` | System architecture overview |
| `docs/SCHEMA_GAPS.md` | Known DB schema gaps |
| `docs/route-map.md` | Route information architecture |
