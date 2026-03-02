# ~~TODO: Marketing Worker Hardening~~ DONE

Marketing worker implemented. All hardening measures applied.

## Required
- [x] Idempotent jobId at enqueue: `makeJobId('marketing', authorId, bookId, language)`
- [x] Budget gate before AI calls (uses `checkBudget` from `src/lib/workers/budget.ts`)
- [x] Retry policy: `attempts: 2`, exponential backoff 5s

## Implementation
- Queue name: `QUEUE_NAMES.MARKETING` ("marketing-campaign") in `src/lib/queue-names.ts`
- Enqueue helper: `src/lib/marketing-queue.ts` (`enqueueMarketingJob()`)
- Worker: `scripts/marketing-worker.ts` (`npm run marketing-worker`)
- API endpoint: `POST /api/books/[id]/marketing/schedule`
- UI: `AutomationTeaser` component with generate button

## References
- Shared utilities: `apps/web/src/lib/workers/`
- Queue names: `apps/web/src/lib/queue-names.ts`
- Existing workers: `apps/web/scripts/`
