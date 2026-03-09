import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  const env = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
  const release = process.env.SENTRY_RELEASE;

  const sentryOptions = {
    dsn,
    environment: env,
    release,
    tracesSampleRate: 1.0,
    debug: false,
    enabled: Boolean(dsn),
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(sentryOptions);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions);
  }
}

export const onRequestError = Sentry.captureRequestError;
