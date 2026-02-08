const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeCheckoutSessionMetadata = {
  orderId: string;
  userId: string;
  bookId: string;
};

type CreateStripeCheckoutSessionInput = {
  amount: number;
  currency: string;
  bookTitle: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: StripeCheckoutSessionMetadata;
};

export type StripeCheckoutSession = {
  id: string;
  url: string;
  payment_status?: string;
  currency?: string;
  amount_total?: number;
  metadata?: Record<string, string>;
};

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return key;
}

/** Safe check for author UI: whether payments can be used (no throw). */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && String(key).trim().length > 0);
}

function toStripeCurrency(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function assertSessionShape(payload: unknown): asserts payload is StripeCheckoutSession {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Stripe response");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.id !== "string") {
    throw new Error("Missing Stripe session id");
  }
}

async function stripeRequest(path: string, init: RequestInit): Promise<unknown> {
  const key = getStripeSecretKey();
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Stripe request failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput
): Promise<StripeCheckoutSession> {
  const amount = sanitizeAmount(input.amount);
  if (amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("payment_method_types[0]", "card");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", toStripeCurrency(input.currency));
  params.set("line_items[0][price_data][unit_amount]", String(amount));
  params.set("line_items[0][price_data][product_data][name]", input.bookTitle);
  params.set("client_reference_id", input.metadata.orderId);

  params.set("metadata[order_id]", input.metadata.orderId);
  params.set("metadata[user_id]", input.metadata.userId);
  params.set("metadata[book_id]", input.metadata.bookId);

  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }

  const payload = await stripeRequest("/checkout/sessions", {
    method: "POST",
    body: params.toString(),
  });

  assertSessionShape(payload);

  if (!payload.url) {
    throw new Error("Stripe session URL is missing");
  }

  return payload;
}

export async function getStripeCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  const payload = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
  });
  assertSessionShape(payload);
  return payload;
}
