"use client";

import { createContext, useContext } from "react";

/**
 * Whether this account has AI switched on, made available to client components.
 *
 * Read once in the author layout and provided to the whole tree: the value is
 * per account and never changes mid-render, so a fetch in each AI surface would
 * be one request per panel for a boolean.
 *
 * This is presentation only. It decides what is rendered, never what is
 * allowed — `features/ai-team/settings/guard.ts` does that on the server, and
 * it has to, because a hidden button is not a setting.
 */
const AiAvailabilityContext = createContext(true);

export function AiAvailabilityProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <AiAvailabilityContext.Provider value={enabled}>{children}</AiAvailabilityContext.Provider>;
}

export function useAiEnabled(): boolean {
  return useContext(AiAvailabilityContext);
}
