/**
 * Feature flags – env-based. Used to hide UI sections and gate API routes.
 * Client: read NEXT_PUBLIC_* (available in browser).
 * Server/API: read same env; no NEXT_PUBLIC_ prefix needed for server-only checks.
 *
 * Default: "true" when unset so existing deploys keep behavior. Set to "false" to disable a feature.
 */

function parseBool(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Client (NEXT_PUBLIC_*) – use in client components and server components ───
export function getTranslationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED);
}

export function getAudiobookEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED);
}

export function getMarketingEnabled(): boolean {
  // Default to false - marketing dashboard components use mock data and have TODOs
  const value = process.env.NEXT_PUBLIC_MARKETING_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

export function getDiscoveryEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DISCOVERY_ENABLED);
}

export function getOfflineReadingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED);
}

// ─── Server/API – use in API routes and server-only code ───
export function isTranslationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED ?? process.env.TRANSLATIONS_ENABLED);
}

export function isAudiobookEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED ?? process.env.AUDIOBOOK_ENABLED);
}

export function isMarketingEnabled(): boolean {
  // Default to false - marketing dashboard components use mock data and have TODOs
  const value = process.env.NEXT_PUBLIC_MARKETING_ENABLED ?? process.env.MARKETING_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

export function isDiscoveryEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DISCOVERY_ENABLED ?? process.env.DISCOVERY_ENABLED);
}

export function isOfflineReadingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED ?? process.env.OFFLINE_READING_ENABLED);
}

export function getRecommendationsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_RECOMMENDATIONS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – recommendations ───
export function isRecommendationsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_RECOMMENDATIONS_ENABLED ?? process.env.RECOMMENDATIONS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Client – social ───
export function getSocialEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_SOCIAL_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – social ───
export function isSocialEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_SOCIAL_ENABLED ?? process.env.SOCIAL_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Client – book clubs ───
export function getBookClubsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED);
}

// ─── Server/API – book clubs ───
export function isBookClubsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED ?? process.env.BOOK_CLUBS_ENABLED);
}

// ─── Client – polls ───
export function getPollsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_POLLS_ENABLED);
}

// ─── Server/API – polls ───
export function isPollsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_POLLS_ENABLED ?? process.env.POLLS_ENABLED);
}

// ─── Client – newsletters ───
export function getNewslettersEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED);
}

// ─── Server/API – newsletters ───
export function isNewslettersEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED ?? process.env.NEWSLETTERS_ENABLED);
}

// ─── Client – notifications ───
export function getNotificationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED);
}

// ─── Server/API – notifications ───
export function isNotificationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED ?? process.env.NOTIFICATIONS_ENABLED);
}
