import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,
  tracesSampleRate: 1.0,
  debug: false,
  enabled: Boolean(dsn),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
