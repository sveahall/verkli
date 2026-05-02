type SentryModule = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentryPromise: Promise<SentryModule | null> | null = null;

function loadSentry(): Promise<SentryModule | null> {
  if (!dsn) return Promise.resolve(null);

  sentryPromise ??= import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment:
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,
        tracesSampleRate: 1.0,
        debug: false,
        enabled: true,
      });
      return Sentry;
    })
    .catch(() => null);

  return sentryPromise;
}

void loadSentry();

export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  void loadSentry().then((Sentry) => {
    Sentry?.captureRouterTransitionStart(...args);
  });
}
