/** Status URLs identify stored orders; callers must verify ownership first. */
export function isCheckoutIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export function getPurchaseStatusUrl(bookId: string, orderId: unknown, sessionId: unknown): string | null {
  if (!isCheckoutIdentifier(bookId) || !isCheckoutIdentifier(orderId) || !isCheckoutIdentifier(sessionId)) return null;
  return `/reader/books/${bookId}/purchase/success?order_id=${encodeURIComponent(orderId)}&session_id=${encodeURIComponent(sessionId)}`;
}

export function validatePurchaseStatusUrl(bookId: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(`/reader/books/${bookId}/purchase/success?`)) return null;
  try {
    const parsed = new URL(value, "https://status.invalid");
    const keys = [...parsed.searchParams.keys()];
    if (parsed.hash || keys.length !== 2 || !keys.includes("order_id") || !keys.includes("session_id")) return null;
    const expected = getPurchaseStatusUrl(bookId, parsed.searchParams.get("order_id"), parsed.searchParams.get("session_id"));
    return value === expected ? expected : null;
  } catch {
    return null;
  }
}

export function isUsableCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
