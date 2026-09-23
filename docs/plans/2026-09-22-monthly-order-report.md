# Monthly order report

This package adds a UTC month selector and CSV snapshot to `/author/billing/payouts`. It reads existing `orders` for the authenticated author's currently owned books, keeps currencies separate, and explains every financial field the schema cannot supply. It does not calculate payable earnings from an order's original amount.

## Scope and contracts

- Session/RLS resolves book ownership before the service-role query. No caller-supplied author/account ID or buyer data is accepted or returned. Empty ownership skips the orders query. Both ownership and order pages use ID cursors, with bounded groups of 100 book IDs per order query; any failed page discards the report. A single read-start boundary excludes rows whose creation time is at or after the read start. Concurrent updates/deletions/backdated inserts can still affect this live read; it is not a transaction snapshot.
- Period is `[month start UTC, next month start UTC)` using `orders.created_at`. Status is the current status at read time, not historical settlement status. The source has no test/live mode column; the report cannot separate test payments from live payments. Prior-month reports can change. Concurrent updates during pagination do not constitute an immutable financial ledger; report status stays unreconciled.
- Paid order amounts are original amounts, before partial refunds. Revoked original amounts include full refunds and disputes. They are explicitly not actual refund totals. Pending/failed orders are counts, not sales.
- Refund amounts, fees, tax and royalty are unknown, including on an empty result. Subscription MRR is not historical subscription revenue. Print orders, standalone e-books, external distribution and subscription pool allocations are excluded.
- CSV exports the already loaded snapshot and includes period, generated timestamp, currency minor-unit amounts and the same limitations. It does not make a second read that could silently change totals. Refresh/month change immediately disables export and hides old data; superseded requests cannot overwrite the new result.
- Royalty helper has no commercial defaults. Callers must supply an author share in basis points, explicit deductions and all required known integer amounts. It rounds once per currency and preserves negative adjustments. No production configuration, transfer or payout path calls it.
- Checkout copy tells readers to inspect the payment methods actually offered by Stripe; it does not promise specific methods.

## Royalty decision

The product specification in `Verkli Erbjudande Fredrik 2026-07-29.docx` section 3.6.3 names a 25% platform fee. Its introduction explicitly says it is a nonbinding proposal. `docs/roadmap.md` contains a 30% assumption. `docs/plans/2026-09-14-launch-command-plan.md` records the unresolved conflict. Neither the applicable author agreement nor the calculation base has been verified. Keep `not_configured` until an authorized decision identifies contract/version/effective scope, share, VAT/fee/refund/dispute deductions, rounding and negative adjustments.

## Next financial data contract (proposal only)

Do not reuse `orders.status` as a ledger. Full refunds and disputes currently share that status; partial refunds do not write economic amounts. Preserve existing atomic access revocation and PR74 ownership checks.

A complete follow-up needs immutable ownership/contract-at-sale attribution, provider-object financial event history, and uniquely keyed balance entries per Stripe account + mode + balance-transaction ID. Keep original payment currency separate from balance currency. Persist signed gross/fee/net, source object references, event/object/received dates, balance-created date and available-on date. Refund objects and dispute reversals can have multiple related balance entries; do not count cumulative refunded amounts as new transactions. Provider replay, out-of-order delivery and crash recovery need transactional idempotency and durable reconciliation work. Unmatched sources, missing tax documents or a failed page must remain incomplete.

[Stripe balance transactions](https://docs.stripe.com/api/balance_transactions/object) expose amount, fee, net, currency and availability separately. [Refund objects](https://docs.stripe.com/api/refunds/object) expose both normal and failure balance transactions. Validate against the pinned API version before implementing. A new schema, historical attribution/backfill and accounting period policy need approval; none is applied by this package.

## Local QA (no provider writes)

1. Start the web app with `npm run dev -w @verkli/web -- --port 3045`; open `http://localhost:3045/dev/monthly-report`. The fixture is development-only and explicitly synthetic.
2. Check SEK 123.45 and EUR 45.00 paid amounts, revoked SEK 25.00, and the unknown refund/fee/tax/royalty fields. Export CSV and compare both currency rows and limitations.
3. Choose August 2026 and confirm the empty message. Select the error fixture; export must be disabled. Return to populated state to recover.
4. Select slow response, change August→October quickly, and confirm only October survives. Clear the month and confirm validation with disabled export.
5. Repeat at 390px, keyboard through month/refresh/export, and verify no horizontal overflow. In an authenticated local environment check the real `/author/billing/payouts` integration; anonymous report API calls must return 401.
6. Run the monthly-report unit/API/UI/production-fixture-boundary tests plus existing payment/Stripe webhook regressions. These use synthetic providers; they do not prove live payment settlement, real SQL RPC execution or actual receipt delivery.

## Verification boundary

Initial targeted 181 tests in 21 files and local fixture browser QA passed on 2026-09-22. Independent review reproduced an OFFSET race and truncated ownership scope; five added regressions failed against that version. The correction uses cursor pagination, bounded filters and a read-start cutoff; all 25 package tests pass on Node 22.17.0. Full lint/types/test/build and independent review are tracked separately by the coordinated release owner. No schema/dependency change, production payment, refund, transfer, payout, email or account configuration change is included.
