import { requireAuthorRole } from "./require-author";
import { isMarketingEnabled } from "@/lib/flags";
import {
  apiError,
  E_MARKETING_FEATURE_DISABLED,
  E_UNAUTHORIZED,
  E_FORBIDDEN,
} from "@/lib/api-errors";
import type { User } from "@supabase/supabase-js";

/**
 * Use at the start of every /api/marketing/* route.
 * Ensures MARKETING is enabled (403 if not) and user is an author (401/403).
 * Returns standard apiError responses on failure.
 */
export async function requireAuthorAndMarketingEnabled(): Promise<
  | { user: User; response: null }
  | { user: null; response: Response }
> {
  if (!isMarketingEnabled()) {
    return { user: null, response: apiError(E_MARKETING_FEATURE_DISABLED, 403) };
  }

  const result = await requireAuthorRole();
  if (!result.ok) {
    const status = result.status;
    const errorKey = status === 401 ? E_UNAUTHORIZED : E_FORBIDDEN;
    return { user: null, response: apiError(errorKey, status) };
  }

  return { user: result.user, response: null };
}
