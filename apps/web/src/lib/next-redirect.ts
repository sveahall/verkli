/**
 * Next.js `redirect()` throws a special error with the digest
 * `NEXT_REDIRECT;...` — callers that wrap large blocks in a try/catch must
 * rethrow that error so the runtime can perform the redirect. Matching on
 * the English message string (`err.message === "NEXT_REDIRECT"`) is
 * fragile across Next versions.
 *
 * This helper checks the `digest` property instead, which is the canonical
 * marker Next uses internally. Fall back to the message string so legacy
 * test stubs that fabricate a redirect error still match.
 */
export function isNextRedirectError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    return true;
  }
  // Fallback for older tests / runtimes that only set .message.
  return err.message === "NEXT_REDIRECT" || err.message.startsWith("NEXT_REDIRECT;");
}
