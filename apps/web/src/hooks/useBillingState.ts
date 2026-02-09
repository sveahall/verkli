"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeBillingStatus, type BillingState } from "@/lib/billing/state";
import { parseBillingPlan } from "@/lib/billing/plans";
import { resolveErrorMessage } from "@/lib/error-messages";

type BillingStateApiPayload = Partial<{
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isPlusActive: boolean;
  isProActive: boolean;
  error: string;
}>;

function toBillingState(payload: BillingStateApiPayload): BillingState {
  const plan = parseBillingPlan(payload.plan) ?? null;
  const status = normalizeBillingStatus(payload.status) ?? null;
  const isActive = status === "active" || status === "trialing";
  const isProActive = typeof payload.isProActive === "boolean" ? payload.isProActive : isActive && plan === "pro";
  const isPlusActive =
    typeof payload.isPlusActive === "boolean" ? payload.isPlusActive : isActive && (plan === "plus" || plan === "pro");

  return {
    plan,
    status,
    currentPeriodEnd: typeof payload.currentPeriodEnd === "string" ? payload.currentPeriodEnd : null,
    cancelAtPeriodEnd: Boolean(payload.cancelAtPeriodEnd),
    stripeCustomerId: typeof payload.stripeCustomerId === "string" ? payload.stripeCustomerId : null,
    stripeSubscriptionId: typeof payload.stripeSubscriptionId === "string" ? payload.stripeSubscriptionId : null,
    isPlusActive,
    isProActive,
  };
}

export function useBillingState(): {
  plan: BillingState["plan"];
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isPlusActive: boolean;
  isProActive: boolean;
  pastDue: boolean;
  state: BillingState | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/state", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const body = (await res.json().catch(() => ({}))) as BillingStateApiPayload;
      if (!res.ok) {
        if (res.status === 401) {
          setState(null);
          setError(null);
          return;
        }
        setError(resolveErrorMessage(body.error));
        setState(null);
        return;
      }

      setState(toBillingState(body));
      setError(null);
    } catch {
      setError(resolveErrorMessage(null));
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchState();
  }, [fetchState]);

  return {
    plan: state?.plan ?? null,
    status: state?.status ?? null,
    currentPeriodEnd: state?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: state?.cancelAtPeriodEnd ?? false,
    stripeCustomerId: state?.stripeCustomerId ?? null,
    stripeSubscriptionId: state?.stripeSubscriptionId ?? null,
    isPlusActive: state?.isPlusActive ?? false,
    isProActive: state?.isProActive ?? false,
    pastDue: state?.status === "past_due",
    state,
    loading,
    error,
    refetch: fetchState,
  };
}
