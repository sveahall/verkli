/**
 * Sentry initialization for BullMQ/queue workers (Node process).
 * Import this once at the top of each worker script (after load-dotenv).
 * Uses @sentry/node; only initializes when SENTRY_DSN is set.
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 1.0,
    debug: false,
  });
}

export { Sentry };
