# TODO: Marketing Worker Hardening

No marketing worker exists yet. When implemented, apply these hardening measures:

## Required
- [ ] Idempotent jobId at enqueue: `makeJobId('marketing', orgId, campaignId)`
- [ ] Budget gate before AI calls (use `checkBudget` from `src/lib/workers/budget.ts`)
- [ ] Retry policy: `attempts: 2`, exponential backoff

## References
- Shared utilities: `apps/web/src/lib/workers/`
- Queue names: `apps/web/src/lib/queue-names.ts` (add `MARKETING` entry)
- Existing workers: `apps/web/scripts/` (follow same pattern)
