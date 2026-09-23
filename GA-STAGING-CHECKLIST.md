# GA Release Verification Checklist — Staging

**Status:** READY FOR GA AFTER STAGING CHECKLIST PASS

Every check marked **GA blocker: YES** must pass before production deploy.
Run this checklist once in staging against a clean state.

---

## 0. Migration Version Check

### 0.1 Verify migration history includes required migrations

**Action:**
```sql
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
```

**Expected result:** Output includes at minimum:
- `20260211100000` (`payment_webhook_atomic_processing`)
- `20260312130000` (`per_chapter_pricing_model`)

**Failure means:** Production database is running an older schema than the code expects. All payment finalization RPCs, entitlement constraints, and per-chapter pricing logic will be missing or incorrect.

**GA blocker:** YES

---

## 1. Database Constraints

### 1.1 Verify `finalize_order_checkout_session` RPC exists

**Action:**
```sql
SELECT proname, prorettype::regtype
FROM pg_proc
WHERE proname = 'finalize_order_checkout_session';
```

**Expected result:** One row with `prorettype = boolean`.

**Failure means:** Book purchases complete in Stripe but entitlements are never created. Users pay but cannot read.

**GA blocker:** YES

---

### 1.2 Verify donation and credit RPC functions exist

**Action:**
```sql
SELECT proname FROM pg_proc
WHERE proname IN (
  'finalize_donation_checkout_session',
  'finalize_credit_topup_checkout_session',
  'grant_user_credits_once'
);
```

**Expected result:** Three rows.

**Failure means:** Donation and credit topup payments complete in Stripe but credits are never applied.

**GA blocker:** YES

---

### 1.3 Verify `entitlements` unique constraint

**Action:**
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.entitlements'::regclass AND contype = 'u';
```

**Expected result:** Unique constraint on `(user_id, book_id)`.

**Failure means:** `ON CONFLICT DO NOTHING` in `finalize_order_checkout_session` does not work. Webhook replays create duplicate entitlements.

**GA blocker:** YES

---

### 1.4 Verify `stripe_events` unique constraint

**Action:**
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.stripe_events'::regclass AND contype = 'u';
```

**Expected result:** Unique constraint on `stripe_event_id`.

**Failure means:** Webhook idempotency is broken. Every Stripe retry processes the event again.

**GA blocker:** YES

---

### 1.5 Verify `user_usage_monthly` unique constraint

**Action:**
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.user_usage_monthly'::regclass AND contype = 'u';
```

**Expected result:** Unique constraint on `(user_id, usage_month)`.

**Failure means:** Trailer quota optimistic lock fails. Users can bypass generation limits.

**GA blocker:** YES

---

### 1.6 Verify `billing_accounts` unique constraint

**Action:**
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.billing_accounts'::regclass AND contype = 'u';
```

**Expected result:** Unique constraint on `(user_id, role)`.

**Failure means:** Subscription webhooks insert duplicate rows. Billing state becomes unpredictable.

**GA blocker:** YES

---

## 2. Stripe Webhook Integration

### 2.1 Webhook endpoint receives events

**Action:**
1. Stripe Dashboard → Developers → Webhooks → Staging endpoint
2. Send test event: `checkout.session.completed`

**Expected result:** HTTP 200 with `{"received":true,"ignored":true}`.

**Inspect logs:** `[stripe.webhook] signature verification failed` must NOT appear.

**Failure means:** Stripe cannot reach webhook or signatures don't match. No payments finalized.

**GA blocker:** YES

---

### 2.2 Environment variables set in production

**Action:** Verify in hosting dashboard that both are set and non-empty:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Do NOT log the values.

**Failure means:** Webhook returns 500 on every call.

**GA blocker:** YES

---

### 2.3 Webhook replay produces no duplicate effects

**Action:**
1. Complete the purchase in check 3.1 first
2. Find the event ID from `stripe_events`:
   ```sql
   SELECT stripe_event_id FROM stripe_events ORDER BY created_at DESC LIMIT 1;
   ```
3. In Stripe Dashboard → Events → find that event → click "Resend"
4. Wait for delivery

**Expected result:**
- HTTP 200 returned to Stripe
- Response body contains `"duplicate": true`
- No new rows in `entitlements`:
  ```sql
  SELECT count(*) FROM entitlements WHERE book_id = '<bookId>' AND user_id = '<userId>';
  -- Should be exactly 1 (same as before replay)
  ```
- No new rows in `orders` with `status = 'paid'` for this session
- No new `credit_grants` rows

**Failure means:** Idempotency guard is broken. Webhook replays cause duplicate entitlements, double credits, or duplicate order state transitions.

**GA blocker:** YES

---

### 2.4 Signature verification failure is logged

**Action:**
```bash
curl -X POST <staging-webhook-url> \
  -H "stripe-signature: invalid" \
  -H "content-type: application/json" \
  -d '{}'
```

**Expected result:** HTTP 400. Log entry: `[stripe.webhook] signature verification failed` with `errorType` and `message`.

**Failure means:** Tampered payloads rejected silently with no audit trail.

**GA blocker:** No — deferrable. Functional behavior is correct.

---

## 3. Purchase → Entitlement → Read → Review

### 3.1 Complete a book purchase end-to-end

**Action:**
1. Ensure test book: `price_amount > 0`, `status = 'PUBLISHED'`
2. As reader user (NOT author), call `POST /api/books/{bookId}/purchase/checkout`
3. Complete Stripe checkout with card `4242 4242 4242 4242`
4. Return to success URL
5. Wait up to 30 seconds for webhook

**Inspect:**
```sql
SELECT status FROM orders WHERE book_id = '<bookId>' AND user_id = '<userId>';
-- Expected: 'paid'

SELECT * FROM entitlements WHERE book_id = '<bookId>' AND user_id = '<userId>';
-- Expected: 1 row with source = 'purchase'

SELECT * FROM stripe_events ORDER BY created_at DESC LIMIT 3;
-- Expected: event for this checkout
```

**Failure means:** Commerce flow is broken. Users pay but get nothing.

**GA blocker:** YES

---

### 3.2 Purchased book is readable

**Action:** After 3.1, navigate to a non-preview chapter of the purchased book.

**Expected result:** Chapter content loads. Access resolves to `full` / `purchased`.

**Failure means:** Entitlements exist but `canUserReadBook` can't find them. Schema mismatch.

**GA blocker:** YES

---

### 3.3 Purchased user can review

**Action:** After 3.1:
```
POST /api/books/{bookId}/reviews
{"rating": 4, "content": "Staging test review"}
```

**Expected result:** HTTP 200, review created.

**Failure means:** Access check rejects legitimate purchasers.

**GA blocker:** YES

---

### 3.4 Unpurchased user CANNOT review paid book

**Action:** Different user, no purchase:
```
POST /api/books/{bookId}/reviews
{"rating": 1, "content": "Never read this"}
```

**Expected result:** HTTP 403, `error: "FORBIDDEN"`.

**Failure means:** Unauthorized reviews are possible.

**GA blocker:** YES

---

### 3.5 Author CANNOT review own book

**Action:** As book author:
```
POST /api/books/{bookId}/reviews
{"rating": 5, "content": "My own masterpiece"}
```

**Expected result:** HTTP 403, `error: "FORBIDDEN"`.

**Failure means:** Authors can inflate ratings.

**GA blocker:** YES

---

### 3.6 Free book review works without entitlement

**Action:** Any user, book with `price_amount = 0`:
```
POST /api/books/{freeBookId}/reviews
{"rating": 3, "content": "Free book review"}
```

**Expected result:** HTTP 200, review created.

**Failure means:** Access check is too strict. Free book reviews broken.

**GA blocker:** YES

---

## 4. Subscription State

### 4.1 Subscription creates active billing state

**Action:**
1. `POST /api/billing/checkout` with `{"plan": "pro"}` as author
2. Complete Stripe checkout
3. Wait for webhook
4. `GET /api/billing/state`

**Expected result:** `isProActive: true`, `plan: "pro"`, `status: "active"`.

**Inspect:**
```sql
SELECT plan, status FROM billing_accounts
WHERE user_id = '<userId>' AND role = 'author';
```

**Failure means:** Subscriptions don't activate. Pro features stay locked.

**GA blocker:** YES

---

### 4.2 Subscription cancellation updates billing state

**Action:**
1. `POST /api/billing/portal` → open portal → cancel subscription
2. Wait for `customer.subscription.deleted` webhook
3. `GET /api/billing/state`

**Expected result:** `isProActive: false`, `plan: null`, `status: "canceled"`.

**Failure means:** Canceled users keep Pro access forever.

**GA blocker:** YES

---

### 4.3 `trailerUsedThisMonth` returned in billing state

**Action:** `GET /api/billing/state` as author.

**Expected result:** Response contains `trailerUsedThisMonth` as a number.

**Failure means:** Wizard quota display defaults to 0.

**GA blocker:** No — deferrable. Conservative default (shows 0 used).

---

## 5. Trailer Quota

### 5.1 Generation increments quota

**Action:**
1. Note current count:
   ```sql
   SELECT trailer_count_this_month FROM user_usage_monthly
   WHERE user_id = '<userId>' AND usage_month = '<currentMonth>';
   ```
2. `POST /api/books/{bookId}/trailer/generate` with valid payload
3. Check count again

**Expected result:** Count incremented by exactly 1.

**Failure means:** Quota tracking broken. Unlimited generations.

**GA blocker:** YES

---

### 5.2 Quota limit enforced

**Action:**
```sql
UPDATE user_usage_monthly
SET trailer_count_this_month = 1
WHERE user_id = '<userId>' AND usage_month = '<currentMonth>';
```
Then `POST /api/books/{bookId}/trailer/generate`.

**Expected result:** HTTP 403, `error: "TRAILER_LIMIT_REACHED"`.

**Failure means:** Free users generate unlimited trailers. AI cost leakage.

**GA blocker:** YES

---

### 5.3 Concurrent requests: only one succeeds

**Action:**
1. Reset quota to 0:
   ```sql
   DELETE FROM user_usage_monthly
   WHERE user_id = '<userId>' AND usage_month = '<currentMonth>';
   ```
2. Send two requests simultaneously (two terminal windows, press Enter at the same time, or use a script):
   ```bash
   # Terminal 1
   curl -X POST .../trailer/generate -H "Cookie: ..." -d '...' &
   # Terminal 2
   curl -X POST .../trailer/generate -H "Cookie: ..." -d '...' &
   wait
   ```

**Expected result:**
- One request: HTTP 200 (success)
- Other request: HTTP 403 (`TRAILER_LIMIT_REACHED`) or HTTP 429 (rate limited)
- Database:
  ```sql
  SELECT trailer_count_this_month FROM user_usage_monthly
  WHERE user_id = '<userId>' AND usage_month = '<currentMonth>';
  -- Expected: exactly 1
  ```

**Failure means:** Optimistic lock does not work. Users bypass quota via concurrent requests.

**GA blocker:** YES

---

### 5.4 Quota rollback on generation failure

**Action:**
1. Note current count
2. Temporarily break AI provider (invalid API key or network block)
3. `POST /api/books/{bookId}/trailer/generate`
4. Check count again
5. Restore AI provider

**Expected result:**
- HTTP 500 returned
- Count is SAME as before the call
- Log: `[trailer guardrail] trailer generation failed, quota rolled back`

**Failure means:** Failed generations permanently consume quota.

**GA blocker:** YES — must be verified once before first GA deploy. Can be degraded to deferrable after initial verification.

---

## 6. No 500s on Review Paths

### 6.1 Review POST returns correct status for all scenarios

**Action:** Call `POST /api/books/{bookId}/reviews` for each:

| Scenario | Expected Status |
|----------|----------------|
| Free book, any user | 200 |
| Paid book, user has entitlement | 200 |
| Paid book, user has no entitlement | 403 |
| Book author reviewing own book | 403 |
| Non-existent book ID (valid UUID) | 404 |
| Invalid UUID as book ID | 400 |
| No auth token | 401 |

**No scenario may return 500.**

**Failure means:** Access check has unhandled error path. Missing table or column.

**GA blocker:** YES

---

## 7. Observability

### 7.1 Structured logging present in logs

**Action:** After running checks 2.1 and 3.1, search application logs for:
- `[stripe.webhook]`
- `[billing-upsert]`
- `[purchase.checkout]`
- `[trailer guardrail]`

**Expected result:** At least `[billing-upsert]` and/or `[stripe.webhook]` appear.

**Failure means:** Payment failures invisible in production.

**GA blocker:** No — deferrable. System is functionally correct.

---

### 7.2 Error tracking captures 500s

**Action:** Trigger a 500 (e.g., invalid DB query). Verify it appears in Sentry/error tracker.

**Expected result:** Error with stack trace, path, user context.

**Failure means:** Production errors invisible.

**GA blocker:** No — deferrable for limited GA. Resolve before scaling.

---

## GA Signoff Criteria

All of the following must be true before production deploy:

| # | Criterion | Verified by |
|---|-----------|-------------|
| 1 | Migration `20260211100000` applied; all 3 finalization RPCs + `grant_user_credits_once` exist | 0.1, 1.1, 1.2 |
| 2 | Unique constraints on `stripe_events`, `entitlements`, `billing_accounts`, `user_usage_monthly` | 1.3–1.6 |
| 3 | Stripe webhook receives events and returns 200 | 2.1 |
| 4 | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set in production env | 2.2 |
| 5 | Webhook replay produces no duplicate effects | 2.3 |
| 6 | Purchase completes: payment → webhook → order paid → entitlement → readable → reviewable | 3.1–3.3 |
| 7 | Unauthorized review blocked with 403 | 3.4 |
| 8 | Author self-review blocked with 403 | 3.5 |
| 9 | Free book review works without entitlement | 3.6 |
| 10 | Subscription creates active Pro billing state | 4.1 |
| 11 | Subscription cancellation sets canceled state | 4.2 |
| 12 | Trailer generation increments quota | 5.1 |
| 13 | Trailer quota limit enforced | 5.2 |
| 14 | Concurrent trailer requests: only one succeeds | 5.3 |
| 15 | Trailer quota rollback works on failure (first-time verification) | 5.4 |
| 16 | No review endpoint returns 500 | 6.1 |
| 17 | Lint: 0 errors. Tests: 3603 pass. Build: clean. | CI |

**If any of criteria 1–17 fails, the release is blocked.**

---

## Post-GA: First 24h Monitoring

After the first production deploy, track these metrics for the first 24 hours:

| Metric | Where to check | Healthy signal |
|--------|---------------|----------------|
| `stripe.webhook` event count | Application logs | Events appear within minutes of purchases |
| `entitlements` created count | `SELECT count(*) FROM entitlements WHERE created_at > now() - interval '24h'` | Matches number of successful purchases |
| `orders` with `status = 'paid'` | `SELECT count(*) FROM orders WHERE status = 'paid' AND created_at > now() - interval '24h'` | Non-zero if purchases happened |
| Review POST 403 count | Application logs or error tracker | Should be low; spikes indicate access check is too strict or attack |
| Review POST 500 count | Error tracker | Must be 0. Any 500 = schema mismatch or bug |
| `billing_accounts` updates | `SELECT count(*) FROM billing_accounts WHERE updated_at > now() - interval '24h'` | Matches subscription events |
| `trailer_count_this_month` anomalies | `SELECT * FROM user_usage_monthly WHERE trailer_count_this_month > 5` | No free users above 1, no pro users above 5 |

If review 500s appear or entitlement counts don't match order counts, investigate immediately.
