"use client";

// Client-side PostHog provider.
//   - Initialises posthog-js once when NEXT_PUBLIC_POSTHOG_KEY is set.
//   - Tracks page views on every App Router pathname change.
//   - No-ops gracefully when the key is unset (e.g. local dev without PostHog).
//
// Mounted from the root layout. Sprint-0 scope: page views only. Identify /
// alias calls are emitted server-side from the auth callback — see
// `lib/analytics/posthog-server.ts`.

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type PostHogClient = typeof import("posthog-js").default;

let posthogClient: PostHogClient | null = null;
let posthogInitPromise: Promise<PostHogClient | null> | null = null;

function initPostHogOnce(): Promise<PostHogClient | null> {
  if (posthogClient) return Promise.resolve(posthogClient);
  if (typeof window === "undefined") return Promise.resolve(null);

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  posthogInitPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      if (posthogClient) return posthogClient;

      try {
        posthog.init(key, {
          api_host: host,
          capture_pageview: false, // We do this manually on App Router transitions.
          capture_pageleave: true,
          persistence: "localStorage",
          autocapture: false,
          disable_session_recording: true,
        });
        posthogClient = posthog;
        return posthog;
      } catch {
        return null;
      }
    })
    .catch(() => null);

  return posthogInitPromise;
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;

    const search = searchParams?.toString();
    const url = search ? `${pathname}?${search}` : pathname;
    let cancelled = false;

    void initPostHogOnce().then((posthog) => {
      if (cancelled || !posthog) return;

      try {
        posthog.capture("$pageview", { $current_url: url, path: pathname });
      } catch {
        // ignore
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </>
  );
}
