# CSP Report — Sprint 0.5 Task 10

> Status: **researched, not applied.** See `docs/sprint-0.5-deferred.md` §D6.

The original task: "Remove `'unsafe-inline'` from `script-src`. Ensure
PostHog and Vercel Analytics use nonces. Run Mozilla Observatory; target
grade A or higher."

This document captures the strict CSP we *want* and the test plan to get
there safely.

---

## Current CSP (apps/web/next.config.ts)

```
script-src 'self' 'unsafe-inline'
  https://js.stripe.com
  https://platform.twitter.com
  https://cdn.syndication.twimg.com
  https://syndication.twitter.com
  https://www.instagram.com https://*.instagram.com
  https://www.tiktok.com https://*.tiktok.com
  https://va.vercel-scripts.com https://*.vercel-scripts.com
  https://browser.sentry-cdn.com https://js.sentry-cdn.com
  https://runwayml.com https://*.runwayml.com
  https://us-assets.i.posthog.com https://eu-assets.i.posthog.com
```

`'unsafe-inline'` is present because of:
- `apps/web/src/app/layout.tsx` themeScript (light/dark cookie read)
- `apps/web/src/app/layout.tsx` suppressAbortScript (dev-only AbortError shim)
- React 19 hydration bootstrap markers (Next.js framework)
- Vercel Analytics inline shim (`<Analytics />`)
- Vercel Speed Insights inline shim
- Sentry instrumentation-client.ts bootstrapping (when bundled inline)

---

## Target CSP

```
script-src 'self' 'strict-dynamic' 'nonce-<per-request>'
  https://js.stripe.com
  https://us-assets.i.posthog.com https://eu-assets.i.posthog.com
  https://browser.sentry-cdn.com https://js.sentry-cdn.com
  https://va.vercel-scripts.com
```

Notes:

- `'strict-dynamic'` is the modern way to allow scripts loaded by trusted
  scripts (so Next.js's framework can chain-load chunks without each one
  needing a separate allow-listed origin).
- The third-party social embed origins (Twitter / Instagram / TikTok) move
  from `script-src` to `frame-src` — embedded posts don't need to execute
  in our origin's script context.
- Stripe still needs `script-src` for `js.stripe.com`.

---

## Implementation outline

### Step 1: middleware nonce

`apps/web/middleware.ts` already exists. Add:

```ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const res = NextResponse.next({
    request: { headers: new Headers(req.headers) },
  });
  res.headers.set("x-csp-nonce", nonce);
  return res;
}
```

### Step 2: layout reads the nonce

```tsx
// apps/web/src/app/layout.tsx
import { headers } from "next/headers";

export default async function RootLayout(...) {
  const nonce = (await headers()).get("x-csp-nonce") ?? "";
  return (
    <html ...>
      <body ...>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: suppressAbortScript }} />
        ...
      </body>
    </html>
  );
}
```

### Step 3: dynamic CSP header

The CSP value must be generated per-request so it can include the nonce.
That moves CSP out of `next.config.ts` `headers()` (static) and into
`middleware.ts`:

```ts
const csp = [
  "default-src 'self'",
  `script-src 'self' 'strict-dynamic' 'nonce-${nonce}' https://js.stripe.com ...`,
  // …
].join("; ");
res.headers.set("Content-Security-Policy", csp);
```

### Step 4: report-only first

Before removing `'unsafe-inline'`, ship the strict policy as
`Content-Security-Policy-Report-Only` so violations are reported but not
blocked. Watch the Sentry feed for a week. Only after zero violations on
production traffic flip to enforcing.

A report endpoint at `/api/csp-report` collects violations:

```ts
export async function POST(req: Request) {
  const body = await req.text();
  console.warn("[csp-report]", body);
  return new Response(null, { status: 204 });
}
```

---

## Why not in Sprint 0.5

Doing this without the report-only soak phase risks a hard breakage on
first render (white page) — that's the failure mode for missed inline
scripts. Sprint 0.5 was scoped to non-breaking changes; this is the
exception.

The Mozilla Observatory grade is meaningless without a deployed URL, and
this session is local-only.

---

## To unblock

1. Land the report-only header (1 PR; ~30 min) — pass the strict CSP via
   `Content-Security-Policy-Report-Only` while keeping the existing
   enforcing CSP.
2. Soak for one week on staging + prod; review violation reports.
3. Patch every violation source (replace inline script, hash, or nonce).
4. Flip the strict policy to enforcing; remove `'unsafe-inline'`.
5. Run Mozilla Observatory; capture the grade.
