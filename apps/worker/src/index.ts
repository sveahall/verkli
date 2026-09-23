/**
 * Compatibility shim.
 *
 * Canonical worker runtime lives in apps/web/scripts/start-workers.ts.
 * This workspace remains only to avoid breaking existing commands that still
 * enter apps/worker directly.
 */

import "../../web/scripts/start-workers";
