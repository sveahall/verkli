/** Closed beta: creation and planning are available; external delivery is not. */
export const CLOSED_BETA_MESSAGE = "Create, edit, preview and save your marketing. Social publishing is paused during the closed beta.";

// Deliberately independent of SOCIAL_ENABLED, which controls account connections.
// Opening connections or replaying an old job must never enable public posting.
export function isSocialPublishingEnabled(): boolean {
  return false;
}
