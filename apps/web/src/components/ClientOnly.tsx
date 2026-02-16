"use client";

import { useEffect, useState } from "react";

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
