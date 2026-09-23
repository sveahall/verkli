# Balance reconciliation preview

Continue the financial contract with a development-only, synthetic balance comparison at `/dev/balance-reconciliation`. This is a reviewable next step before the separately approved database/provider integration. No schema, provider request, payout, tax rule or royalty default is introduced.

## Design

Compare opening balance plus signed net entries with closing balance, separately for each currency within one explicit account, test/live mode and balance type. Use balance-entry creation time in a half-open UTC interval, not order creation or funds availability. Opening and closing values represent total pending + available funds for the same balance type at the exact interval boundaries; this does not reconcile the two availability buckets independently.

Validate safe integers and `net = amount - fee` before calculation. Preserve negative movements and fee credits. Deduplicate identical balance IDs, reject conflicting duplicates and foreign account/mode/type. Refund reversals and dispute recovery are separate entries; never subtract a cumulative refund object again. Use bigint intermediates and reject unsafe output. An empty input with no checkpoints is unknown, not a zero balance.

Report observed movements even when coverage is incomplete, but never label them complete. Missing pages, unresolved sources or missing checkpoints prevent a matching result. A zero arithmetic difference alone proves neither complete provider coverage nor book/author attribution. No payable earnings are inferred. Currency labels refer to balance currency; there is no FX conversion.

The preview shares the existing monthly report's visual conventions. It offers balanced two-currency, partial refund/reversal, missing-page, unknown-source, missing-balance, mismatch, conflicting-data and empty scenarios. It shows source movements and explicit incomplete states. There is no production link or provider adapter.

## Implementation and verification

1. Write failing tests in `src/lib/payments/balance-reconciliation.test.ts` for the contract, then implement the pure comparison in the adjacent module.
2. Add a reusable comparison view, synthetic scenario data and a dev-only route. Test rendered uncertainty and the production 404 guard.
3. Run related payment tests and lint; verify the view at desktop and 390px, switching every state without network mutations. Coordinate full checks with the release owner.

## Local QA

1. Open `http://localhost:3045/dev/balance-reconciliation`. Confirm the synthetic-only notice and separate SEK/EUR sections.
2. Select refund and reversal. Check that the reversal restores the refund amount once and retained fees remain visible.
3. Select missing page, unresolved source and missing checkpoint. Each must say incomplete even if the visible arithmetic matches.
4. Select mismatch, then conflicting data. A mismatch shows the difference; invalid data shows an error and no previous totals.
5. Select empty. No invented currency or zero balance should appear. Repeat with keyboard and at 390px without page overflow.
6. Under production/test mode the route must return not found; no scenario calls Stripe or a database.

## Source semantics

[Stripe balance transactions](https://docs.stripe.com/api/balance_transactions/object) define signed gross, fees, net, currency, creation and availability separately. [Refunds](https://docs.stripe.com/api/refunds/object) can reference both the initial and failure balance transactions. This normalized prototype does not assert compatibility with a live API version or implement provider ingestion. Balance type must be established explicitly by a future adapter.
