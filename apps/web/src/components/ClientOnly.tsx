"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders children only after mount on the client. Server renders nothing.
 * Use to avoid hydration mismatch for components that depend on window/localStorage or
 * that are not critical for first paint (e.g. theme toggle).
 */
export default function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
