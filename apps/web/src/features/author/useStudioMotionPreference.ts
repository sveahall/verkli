"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reduceMotionOnServer = () => true;

/** Stable server/first-client styles, then the visitor's live preference. */
export function useStudioMotionPreference() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, reduceMotionOnServer);
}
