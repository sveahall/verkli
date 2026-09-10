# Launch readiness QA — 10 September 2026

## Decision

The launch is **not yet fully verified**. This pass fixes confirmed public access and delivery defects. A green unit suite or a healthy landing page is not proof that the complete author, reader, payment and background-job journeys work in production.

The launch plan at `docs/plan/launch-plan-2026-09.md` targets 20 September. Its older infrastructure statements are historical; use the observations below for this QA pass.

## Confirmed defects and fixes

| Defect | Evidence before | Change and verification |
| --- | --- | --- |
| Stripe webhook blocked by beta gate | Live unsigned POST returned 403 `Beta access required`, before signature verification. All Stripe configuration checks nevertheless passed. | Exact webhook POST bypasses site gates and browser authentication; its HMAC verifier still rejects unsigned requests with 400. Middleware and signed-webhook regressions pass. |
| Public legal/navigation/support paths redirected to waitlist | Live privacy/support requests returned 307 to waitlist. | Buyer pages remain public under both gates; author marketing links remain public under the beta gate. Ten browser checks cover actual destinations, mobile layout and private-route rejection. |
| Support form API blocked by beta gate | Empty same-origin POST returned 403 instead of validation failure. | Exact POST reaches the existing validation and rate limiter after CSRF checks. GET/history stays gated. Empty POST now returns 400; no support message was submitted. |
| Successful login silently returned an uninvited account to waitlist | Real browser login with the existing QA account succeeded, then showed the ordinary waitlist. | Signed-in redirects include an access explanation and account/support links. Real QA login against the production build shows the notice; changing account reaches sign-in. No account permissions changed. |
| Standalone e-book buyer lost the only return link after closing the tab | Paid-order webhook only logged the purchase; delivery existed only on the success page. | Paid e-book webhook emails a return link to the entitlement-checking page. Event claims and provider idempotency prevent retries from creating duplicate delivery within their respective guarantees; failed sends return 500 so Stripe retries. Print and unpaid orders receive no e-book link. Email I/O was mocked; actual inbox delivery is still unverified. |
| Standalone e-book access did not check subsequent refunds/disputes | The helper accepted any historical paid e-book checkout; regressions proved a refunded or disputed charge still received a signed URL. | Both the return page and download route check the current expanded charge. Full refunds, disputes and unverifiable charge data cannot issue new links; partial refunds keep access, matching the existing platform rule. Already issued storage URLs remain valid for up to their one-hour TTL, and downloaded files cannot be recalled. |

Refund fields and expansion are checked against the pinned SDK types and [Stripe's Charge reference](https://docs.stripe.com/api/charges/object). The regression also verifies the outgoing `payment_intent.latest_charge` expansion parameter.

## Fresh checks

- `npm run lint -w @verkli/web`: passed.
- `npm test -w @verkli/web`: **173 files, 1,813 tests passed**, including the final refund regressions.
- `npm run build -w @verkli/web`: passed, including TypeScript and emitted middleware.
- `playwright.launch.config.ts`: **10 browser tests passed** against `next start` on port 3022 with `BETA_LOCK=true` and `NEXT_PUBLIC_WAITLIST_ONLY=false`.
- Separate real sign-in using the existing, uninvited QA account: correct access notice, account-switch link usable, zero browser page errors.
- Stripe live catalog: all four configured author/reader subscription prices resolved. Webhook enabled, all 12 handled event types subscribed.
- Paid-chapter RLS policy shape check passed. **No published paid book was available for its real anonymous entitlement probe**, so that probe was not a pass.
- `book-downloads` storage bucket exists and is private. `ta-for-er/ta-for-er.pdf` exists (2,327,522 bytes); EPUB is absent. The delivery UI only offers formats actually present.
- Railway reports successful deployments for web, Redis, import, translation, audiobook and recommendations services. This does **not** prove that their queues are being consumed.
- Production has no configured ops health token. No existing public Redis connection was exposed, and Railway SSH had no registered key. Queue depths and worker heartbeats therefore remain unverified. No credentials or network exposure were added.

### Local QA must use the production build

The repository's webpack dev server does not exercise the same middleware boundary. Turbopack dev also did not reproduce the production gate in this pass. Testing only dev gave a misleading successful result for the public routes; the private-route test exposed the difference. Use build plus start for access QA:

```sh
BETA_LOCK=true NEXT_PUBLIC_WAITLIST_ONLY=false NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022 npm run build -w @verkli/web
BETA_LOCK=true NEXT_PUBLIC_WAITLIST_ONLY=false NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022 npm run start -w @verkli/web -- --hostname 127.0.0.1 --port 3022
# In a second terminal, from apps/web:
PLAYWRIGHT_CHANNEL=chrome npx --no-install playwright test --config playwright.launch.config.ts
```

## Remaining launch gates, in order

1. **Authenticated author/reader journey:** grant the designated QA account temporary beta access only with explicit approval; restore its exact previous flags afterwards. Verify manuscript import, editing/autosave after reload, translation, audio and publication/reader access using designated test content.
2. **Paid delivery:** complete an authorized test purchase, verify entitlement, download and actual receipt/return-link email, then verify duplicate callbacks and refund access. No real charge or email was initiated in this pass.
3. **Worker operations:** inspect authenticated health and queue consumers from an approved production access path. Prove a real import/translation/audio job reaches completion, including failed-job handling. A successful container deployment alone is insufficient.
4. **Launch rehearsal:** fresh invited account, mobile browser, reset-password link, support contact and rollback/recovery. Confirm the exact production revision and feature scope before opening the cohort.

The automatic permission reviewer rejected a temporary production beta-access change for the existing QA account because that particular account permission change had not been explicitly approved. The command did not run. This does not invalidate the completed public and negative-access checks, but positive workspace QA remains pending.

## UI QA script

1. Open `/author/signin`; follow Privacy and Terms, then `/support`. Each page must load, and an empty support form must not send.
2. Open `/product`, `/pricing` and `/faq` while signed out. Product intentionally resolves to `/author`; private `/author/home` and `/reader/library` must go to waitlist.
3. Sign in with a valid, uninvited test account. Confirm the access notice, working support link and ability to use another account. Do not change account flags without approval.
4. At 390px width, open `/waitlist?access=pending`. Confirm readable notice, usable links and no horizontal overflow; ordinary `/waitlist` must not claim the visitor is signed in.
5. Open `/order/ta-for-er/success` without a session. It must not claim payment or expose a download. After an authorized paid test, verify the actual file and emailed return link separately.
6. Run the browser suite against the released URL with `LAUNCH_QA_URL=https://www.verkli.com`, then inspect the deployed revision. It sends only invalid support/unsigned webhook probes and performs no purchase or signup.

Detailed local logs and screenshots: `/tmp/verkli-launch-qa/`. Secrets, session cookies and payment identifiers are not committed.
