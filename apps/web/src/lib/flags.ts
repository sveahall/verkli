/**
 * Feature flags – env-based.
 *
 * IMPORTANT: NEXT_PUBLIC_* env vars are baked into the JS bundle at `next build`
 * time. Flipping any flag below requires a redeploy, NOT a runtime config change.
 * Cohort-gated soft-launch protocol depends on this — see CEO plan §C2.
 *
 * Default behavior: when the env var is undefined, empty, or any non-truthy
 * value, the flag is OFF. To enable a flag, set the env var to "true" or "1"
 * EXPLICITLY in the deploy environment. There is no implicit-true behavior.
 *
 * ─── Deploy env checklist for cohort-gated soft launch ──────────────────────
 *
 * Required to KEEP a feature visible after this build (set in staging + prod):
 *
 *   NEXT_PUBLIC_TRANSLATIONS_ENABLED=true   author translations + UI tab
 *   NEXT_PUBLIC_MARKETING_ENABLED=true      marketing/trailer/social UI
 *   NEXT_PUBLIC_DISCOVERY_ENABLED=true      /reader/discover, /reader/genres
 *
 * Required OFF for cohort-gated soft launch (default; do NOT set):
 *
 *   NEXT_PUBLIC_AUDIOBOOK_ENABLED          (D4: defer audiobook to P1, flag-on later)
 *   NEXT_PUBLIC_FREEMIUM_GATE_ENABLED      (D4 + D11: no quota gating during cohort window)
 *
 * Other flags also default OFF unless explicitly set; see individual functions.
 *
 * Flag changes require redeploy. Rollback procedure is the same: change env,
 * trigger redeploy, wait ~2 min for build. There is no runtime flip.
 *
 * ─── Server-only fallback ───────────────────────────────────────────────────
 *
 * The isXxx server functions also accept a non-public env (e.g. MARKETING_ENABLED)
 * as a fallback when the NEXT_PUBLIC_ form is not set. Use only for server-only
 * gating that should NOT leak to the client bundle. Same default-OFF semantics.
 */

function parseBool(value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  const v = value.toLowerCase();
  return v === "true" || v === "1";
}

// ─── Client (NEXT_PUBLIC_*) — read in client/server components ───
export function getTranslationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED);
}

export function getAudiobookEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED);
}

export function getMarketingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_MARKETING_ENABLED);
}

export function getDiscoveryEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DISCOVERY_ENABLED);
}

/**
 * Resolve the canonical discover route href, or `null` when the discovery
 * feature is gated off. Use this for any user-facing CTA that points at
 * /reader/discover so the link is hidden instead of leading to a 404 during
 * soft-launch / cohort gating. The route itself still 404s on direct access
 * — that gating contract is intentional and unchanged.
 */
export function getDiscoverHref(): string | null {
  return getDiscoveryEnabled() ? "/reader/discover" : null;
}

export function getOfflineReadingEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED);
}

export function getRecommendationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_RECOMMENDATIONS_ENABLED);
}

export function getBookClubsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED);
}

export function getPollsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_POLLS_ENABLED);
}

export function getNewslettersEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED);
}

export function getAiChatEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_AI_CHAT_ENABLED);
}

export function getFreemiumGateEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_FREEMIUM_GATE_ENABLED);
}

// Sprint-0 demo flag. Toggles a small visible badge on the author home page so
// the flag-flip pipeline (env -> redeploy -> bundle update) can be exercised
// end-to-end. Default OFF in every environment. Safe to leave permanently OFF.
export function getSprint0DemoBadgeEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED);
}

// Sprint-0.5: feature gate for donations. While the donation flow ships its
// real Stripe path, the entry points stay hidden until this is explicitly
// enabled in production. Default OFF.
export function getDonationsEnabled(): boolean {
  return parseBool(process.env.NEXT_PUBLIC_DONATIONS_ENABLED);
}

// ─── Server/API — also reads non-public fallback for server-only contexts ───
export function isTranslationsEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_TRANSLATIONS_ENABLED ?? process.env.TRANSLATIONS_ENABLED
  );
}

export function isAudiobookEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED ?? process.env.AUDIOBOOK_ENABLED
  );
}

export function isMarketingEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_MARKETING_ENABLED ?? process.env.MARKETING_ENABLED
  );
}

export function isDiscoveryEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_DISCOVERY_ENABLED ?? process.env.DISCOVERY_ENABLED
  );
}

export function isOfflineReadingEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_OFFLINE_READING_ENABLED ?? process.env.OFFLINE_READING_ENABLED
  );
}

export function isRecommendationsEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_RECOMMENDATIONS_ENABLED ?? process.env.RECOMMENDATIONS_ENABLED
  );
}

export function isBookClubsEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_BOOK_CLUBS_ENABLED ?? process.env.BOOK_CLUBS_ENABLED
  );
}

export function isSocialEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_SOCIAL_ENABLED ?? process.env.SOCIAL_ENABLED
  );
}

export function isPollsEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_POLLS_ENABLED ?? process.env.POLLS_ENABLED
  );
}

export function isNewslettersEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_NEWSLETTERS_ENABLED ?? process.env.NEWSLETTERS_ENABLED
  );
}

// Defaults OFF: every request is a billable LLM call, so opt-in explicitly via
// env. When disabled the chat route returns deterministic template replies.
export function isAiChatEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_AI_CHAT_ENABLED ?? process.env.AI_CHAT_ENABLED
  );
}

export function isFreemiumGateEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_FREEMIUM_GATE_ENABLED ?? process.env.FREEMIUM_GATE_ENABLED
  );
}

export function isSprint0DemoBadgeEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED ??
      process.env.SPRINT0_DEMO_BADGE_ENABLED
  );
}

export function isDonationsEnabled(): boolean {
  return parseBool(
    process.env.NEXT_PUBLIC_DONATIONS_ENABLED ?? process.env.DONATIONS_ENABLED
  );
}
