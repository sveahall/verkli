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
  current_period_start: number | null;
  current_period_end: number | null;
  created: number | null;
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

const STRIPE_REQUEST_TIMEOUT_MS = 15_000;

async function stripeRequest(path: string, init: RequestInit): Promise<unknown> {
  const key = getStripeSecretKey();
  // Bound the call so a hung Stripe API doesn't pin the request handler
  // waiting forever. The SDK ships its own timeout; this hand-rolled path
  // was missing one entirely.
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
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
  /** For webhook logging; resolution from price ids is authoritative. */
  billingRole?: "reader" | "author";
  billingPlan?: "plus" | "pro";
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
  if (input.billingRole) params.set("metadata[billing_role]", input.billingRole);
  if (input.billingPlan) params.set("metadata[billing_plan]", input.billingPlan);
  params.set("subscription_data[metadata][user_id]", input.userId);
  params.set("subscription_data[metadata][plan]", input.plan);
  if (input.billingRole) params.set("subscription_data[metadata][billing_role]", input.billingRole);
  if (input.billingPlan) params.set("subscription_data[metadata][billing_plan]", input.billingPlan);

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

/** Fetch checkout session with line_items expanded (for sync after redirect when webhook did not run). */
export async function getCheckoutSessionWithLineItems(sessionId: string): Promise<StripeRecord> {
  const params = new URLSearchParams();
  params.set("expand[]", "line_items");
  params.set("expand[]", "line_items.data.price");
  const payload = await stripeRequest(
    `/checkout/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`,
    { method: "GET" }
  );
  const record = asRecord(payload);
  if (!record || typeof record.id !== "string") {
    throw new Error("Invalid Stripe checkout session response");
  }
  return record;
}

export async function createStripeCustomerPortalSession(input: {
  customerId: string;
  returnUrl: string;
  /** When set, portal opens directly to manage this subscription (e.g. role-scoped). */
  subscriptionId?: string | null;
}): Promise<StripePortalSession> {
  const params = new URLSearchParams();
  params.set("customer", input.customerId);
  params.set("return_url", input.returnUrl);
  if (input.subscriptionId?.trim()) {
    params.set("flow_data[type]", "subscription_update");
    params.set("flow_data[subscription_update][subscription]", input.subscriptionId.trim());
  }

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
    const price = itemRecord?.price;
    const id =
      typeof price === "string"
        ? price.trim()
        : typeof asRecord(price)?.id === "string"
          ? (asRecord(price)!.id as string).trim()
          : "";
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

function parseStripeTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
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
    current_period_start: parseStripeTimestamp(payload.current_period_start),
    current_period_end: parseStripeTimestamp(payload.current_period_end),
    created: parseStripeTimestamp(payload.created),
    cancel_at_period_end: Boolean(payload.cancel_at_period_end ?? false),
    metadata: extractMetadata(payload),
    price_ids: extractPriceIds(payload),
  };
}

export async function getStripeCustomerSubscriptions(customerId: string): Promise<StripeSubscription[]> {
  const params = new URLSearchParams();
  params.set("customer", customerId);
  params.set("status", "all");
  params.set("limit", "100");
  params.set("expand[]", "data.items.data.price");

  const payload = await stripeRequest(`/subscriptions?${params.toString()}`, {
    method: "GET",
  });

  const record = asRecord(payload);
  const rows = Array.isArray(record?.data) ? record.data : [];

  const subscriptions: StripeSubscription[] = [];
  for (const row of rows) {
    const subscription = asRecord(row);
    if (!subscription || typeof subscription.id !== "string" || !subscription.id.trim()) {
      continue;
    }

    subscriptions.push({
      id: subscription.id.trim(),
      customer: extractCustomerId(subscription),
      status: typeof subscription.status === "string" ? subscription.status : null,
      current_period_start: parseStripeTimestamp(subscription.current_period_start),
      current_period_end: parseStripeTimestamp(subscription.current_period_end),
      created: parseStripeTimestamp(subscription.created),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end ?? false),
      metadata: extractMetadata(subscription),
      price_ids: extractPriceIds(subscription),
    });
  }

  return subscriptions;
}

/** List Stripe customers by email (for recovering billing row when we have no customer_id). */
export async function listStripeCustomersByEmail(email: string): Promise<{ id: string }[]> {
  const trimmed = String(email ?? "").trim();
  if (!trimmed) return [];

  const params = new URLSearchParams();
  params.set("email", trimmed);
  params.set("limit", "10");

  const payload = await stripeRequest(`/customers?${params.toString()}`, {
    method: "GET",
  });

  const record = asRecord(payload);
  const rows = Array.isArray(record?.data) ? record.data : [];
  const result: { id: string }[] = [];
  for (const row of rows) {
    const customer = asRecord(row);
    if (customer && typeof customer.id === "string" && customer.id.trim()) {
      result.push({ id: customer.id.trim() });
    }
  }
  return result;
}
