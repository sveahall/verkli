"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeBillingStatus, type BillingState } from "@/lib/billing/state";
import { parseBillingPlan } from "@/lib/billing/plans";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

type BillingStateApiPayload = Partial<{
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isPlusActive: boolean;
  isProActive: boolean;
  isProPlusActive: boolean;
  plusCancelAtPeriodEnd: boolean;
  plusPeriodEnd: string | null;
  error: string;
}>;

type UseBillingStateOptions = {
  /** Optional auto-refresh interval in ms. Omit/0 to disable polling. */
  pollIntervalMs?: number;
  /** Server-rendered state so the plan shows immediately without waiting for first fetch. */
  initialState?: BillingState | null;
};

function toBillingState(payload: BillingStateApiPayload): BillingState {
  const plan = parseBillingPlan(payload.plan) ?? null;
  const status = normalizeBillingStatus(payload.status) ?? null;
  const isActive = status === "active" || status === "trialing";
  const isProActive =
    typeof payload.isProActive === "boolean"
      ? payload.isProActive
      : isActive && (plan === "pro" || plan === "pro_plus");
  const isPlusActive =
    typeof payload.isPlusActive === "boolean" ? payload.isPlusActive : isActive && (plan === "plus" || plan === "pro");
  const isProPlusActive =
    typeof payload.isProPlusActive === "boolean" ? payload.isProPlusActive : isActive && plan === "pro_plus";

  return {
    plan,
    status,
    currentPeriodEnd: typeof payload.currentPeriodEnd === "string" ? payload.currentPeriodEnd : null,
    cancelAtPeriodEnd: Boolean(payload.cancelAtPeriodEnd),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isPlusActive,
    isProPlusActive,
    isProActive,
    plusCancelAtPeriodEnd: Boolean(payload.plusCancelAtPeriodEnd),
    plusPeriodEnd: typeof payload.plusPeriodEnd === "string" ? payload.plusPeriodEnd : null,
  };
}

export function useBillingState(options?: UseBillingStateOptions): {
  plan: BillingState["plan"];
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isPlusActive: boolean;
  isProActive: boolean;
  pastDue: boolean;
  state: BillingState | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const pollIntervalMs = options?.pollIntervalMs ?? 0;
  const initialState = options?.initialState ?? null;
  const isVisible = useDocumentVisible();
  const [state, setState] = useState<BillingState | null>(initialState);
  const [loading, setLoading] = useState(!initialState);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchState = useCallback(async () => {
    if (inFlightRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/billing/state", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
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
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setError(resolveErrorMessage(null));
      setState(null);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const prevVisibleRef = useRef(isVisible);

  useEffect(() => {
    setLoading(true);
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (isVisible && !prevVisibleRef.current) {
      void fetchState();
    }
    prevVisibleRef.current = isVisible;
  }, [isVisible, fetchState]);

  useEffect(() => {
    const onFocus = () => void fetchState();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchState]);

  useEffect(() => {
    if (!isVisible) return;
    if (!pollIntervalMs || pollIntervalMs < 1000) return;
    const interval = setInterval(() => {
      void fetchState();
    }, pollIntervalMs);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchState, isVisible, pollIntervalMs]);

  return {
    plan: state?.plan ?? null,
    status: state?.status ?? null,
    currentPeriodEnd: state?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: state?.cancelAtPeriodEnd ?? false,
    isPlusActive: state?.isPlusActive ?? false,
    isProActive: state?.isProActive ?? false,
    pastDue: state?.status === "past_due",
    state,
    loading,
    error,
    refetch: fetchState,
  };
}
