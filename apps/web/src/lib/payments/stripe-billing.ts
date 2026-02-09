const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeRecord = Record<string, unknown>;

type StripeCustomer = {
  id: string;
};

type StripeCheckoutSession = {
  id: string;
  url: string;
};

type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeSubscription = {
  id: string;
  customer: string | null;
  status: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  price_ids: string[];
};

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return key;
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

function asRecord(value: unknown): StripeRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as StripeRecord;
}

function assertRecordWithId(payload: unknown): asserts payload is StripeRecord & { id: string } {
  const record = asRecord(payload);
  if (!record || typeof record.id !== "string") {
    throw new Error("Invalid Stripe response payload");
  }
}

export async function createStripeCustomer(input: {
  email?: string | null;
  userId: string;
}): Promise<StripeCustomer> {
  const params = new URLSearchParams();
  if (input.email) {
    params.set("email", input.email);
  }
  params.set("metadata[user_id]", input.userId);

  const payload = await stripeRequest("/customers", {
    method: "POST",
    body: params.toString(),
  });

  assertRecordWithId(payload);
  return {
    id: payload.id,
  };
}

export async function createStripeSubscriptionCheckoutSession(input: {
  customerId: string;
  plan: "plus" | "pro";
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer", input.customerId);
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[user_id]", input.userId);
  params.set("metadata[plan]", input.plan);
  params.set("subscription_data[metadata][user_id]", input.userId);
  params.set("subscription_data[metadata][plan]", input.plan);

  const payload = await stripeRequest("/checkout/sessions", {
    method: "POST",
    body: params.toString(),
  });

  assertRecordWithId(payload);
  if (typeof payload.url !== "string" || !payload.url) {
    throw new Error("Missing Stripe checkout URL");
  }

  return {
    id: payload.id,
    url: payload.url,
  };
}

export async function createStripeCustomerPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  const params = new URLSearchParams();
  params.set("customer", input.customerId);
  params.set("return_url", input.returnUrl);

  const payload = await stripeRequest("/billing_portal/sessions", {
    method: "POST",
    body: params.toString(),
  });

  assertRecordWithId(payload);
  if (typeof payload.url !== "string" || !payload.url) {
    throw new Error("Missing Stripe portal URL");
  }

  return {
    id: payload.id,
    url: payload.url,
  };
}

function extractPriceIds(record: StripeRecord): string[] {
  const items = asRecord(record.items);
  if (!items || !Array.isArray(items.data)) return [];

  const ids: string[] = [];
  for (const item of items.data) {
    const itemRecord = asRecord(item);
    const priceRecord = asRecord(itemRecord?.price);
    const id = typeof priceRecord?.id === "string" ? priceRecord.id.trim() : "";
    if (id) ids.push(id);
  }
  return ids;
}

function extractMetadata(record: StripeRecord): Record<string, string> {
  const metadata = asRecord(record.metadata);
  if (!metadata) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function extractCustomerId(record: StripeRecord): string | null {
  const customer = record.customer;
  if (typeof customer === "string" && customer.trim()) return customer.trim();
  const customerRecord = asRecord(customer);
  if (typeof customerRecord?.id === "string" && customerRecord.id.trim()) {
    return customerRecord.id.trim();
  }
  return null;
}

export async function getStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  const payload = await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
  });

  assertRecordWithId(payload);

  return {
    id: payload.id,
    customer: extractCustomerId(payload),
    status: typeof payload.status === "string" ? payload.status : null,
    current_period_end:
      typeof payload.current_period_end === "number" && Number.isFinite(payload.current_period_end)
        ? payload.current_period_end
        : null,
    cancel_at_period_end: Boolean(payload.cancel_at_period_end ?? false),
    metadata: extractMetadata(payload),
    price_ids: extractPriceIds(payload),
  };
}
