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
  const value = process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

export function getMarketingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_MARKETING_ENABLED);
}

export function getDiscoveryEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DISCOVERY_ENABLED);
}

export function getOfflineReadingEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – use in API routes and server-only code ───
export function isTranslationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED ?? process.env.TRANSLATIONS_ENABLED);
}

export function isAudiobookEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED ?? process.env.AUDIOBOOK_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

export function isMarketingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_MARKETING_ENABLED ?? process.env.MARKETING_ENABLED);
}

export function isDiscoveryEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DISCOVERY_ENABLED ?? process.env.DISCOVERY_ENABLED);
}

export function isOfflineReadingEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED ?? process.env.OFFLINE_READING_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
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

// ─── Client – book clubs ───
export function getBookClubsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – book clubs ───
export function isBookClubsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED ?? process.env.BOOK_CLUBS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – social ───
export function isSocialEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_SOCIAL_ENABLED ?? process.env.SOCIAL_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Client – polls ───
export function getPollsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_POLLS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – polls ───
export function isPollsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_POLLS_ENABLED ?? process.env.POLLS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Client – newsletters ───
export function getNewslettersEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

// ─── Server/API – newsletters ───
export function isNewslettersEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED ?? process.env.NEWSLETTERS_ENABLED;
  if (value === undefined || value === "") return false;
  return value.toLowerCase() === "true" || value === "1";
}

