"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useBillingState } from "@/hooks/useBillingState";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import type { BillingPlan } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/state";

export type PlanCard = {
  id: BillingPlan;
  name: string;
  description: string;
  bullets: string[];
};

function formatPlan(plan: BillingPlan | null): string {
  if (plan === "plus") return "Verkli Plus";
  if (plan === "pro") return "Verkli Pro";
  return "No active plan";
}

function formatStatus(status: string | null): string {
  if (!status) return "None";
  if (status === "trialing") return "Trial";
  if (status === "active") return "Active";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  return status;
}

type BillingPageContentProps = {
  planCards: PlanCard[];
  title: string;
  subtitle: string;
  pastDueMessage: string;
  /** Pass from server to avoid useSearchParams (prevents crashes when returning from Stripe). */
  initialCheckout?: string | null;
  initialSessionId?: string | null;
  /** Server-fetched state so plan and status show immediately. */
  initialBillingState?: BillingState | null;
};

export function BillingPageContent({
  planCards,
  title,
  subtitle,
  pastDueMessage,
  initialCheckout = null,
  initialSessionId = null,
  initialBillingState = null,
}: BillingPageContentProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isVisible = useDocumentVisible();
  const { state, loading, error, refetch } = useBillingState({
    pollIntervalMs: 10_000,
    initialState: initialBillingState,
  });
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const router = useRouter();
  const checkoutParam = initialCheckout ?? null;
  const sessionIdParam = initialSessionId ?? null;
  const isCheckoutSuccess = checkoutParam === "success";
  const isCheckoutCancel = checkoutParam === "cancel";
  const [processingCheckout, setProcessingCheckout] = useState(isCheckoutSuccess);
  const [syncingFromStripe, setSyncingFromStripe] = useState(false);
  const burstCountRef = useRef(0);
  const syncDoneRef = useRef(false);
  const recoveryAttemptedRef = useRef(false);
  const isPlanActive =
    planCards[0]?.id === "pro" ? Boolean(state?.isProActive) : Boolean(state?.isPlusActive);

  const clearCheckoutParam = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  // When returning from Stripe checkout (not portal), sync billing state after a short delay so hydration can finish.
  useEffect(() => {
    if (!isCheckoutSuccess || syncDoneRef.current) return;
    syncDoneRef.current = true;
    const t = window.setTimeout(() => {
      (async () => {
        try {
          if (sessionIdParam?.trim()) {
            const res = await fetch("/api/billing/sync", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: sessionIdParam.trim() }),
            });
            if (res.ok) void refetch();
          } else {
            const res = await fetch("/api/billing/sync", { method: "GET", credentials: "include" });
            if (res.ok) void refetch();
          }
        } catch {
          syncDoneRef.current = false;
        }
      })();
    }, 600);
    return () => window.clearTimeout(t);
  }, [isCheckoutSuccess, sessionIdParam, refetch]);

  useEffect(() => {
    if (isCheckoutSuccess || isCheckoutCancel) {
      void refetch();
    }
  }, [isCheckoutSuccess, isCheckoutCancel, refetch]);

  // Only poll + clear URL when we actually have session_id (return from checkout), not from portal return.
  useEffect(() => {
    if (!processingCheckout || !isCheckoutSuccess || !isVisible || !sessionIdParam?.trim()) return;

    const BURST_INTERVAL_MS = 2000;
    const BURST_MAX = 5;

    const tick = () => {
      burstCountRef.current += 1;
      void refetch();
      if (burstCountRef.current >= BURST_MAX) {
        setProcessingCheckout(false);
        clearCheckoutParam();
      }
    };

    const id = setInterval(tick, BURST_INTERVAL_MS);
    return () => clearInterval(id);
  }, [processingCheckout, isCheckoutSuccess, isVisible, sessionIdParam, refetch, clearCheckoutParam]);

  useEffect(() => {
    if (processingCheckout && isPlanActive) {
      setProcessingCheckout(false);
      clearCheckoutParam();
    }
  }, [processingCheckout, isPlanActive, clearCheckoutParam]);

  // When no plan is shown, try once to recover from Stripe (e.g. subscription exists but row was missing).
  useEffect(() => {
    if (loading || recoveryAttemptedRef.current || !state || !planCards?.length) return;
    const noPlan = !state.plan && !state.isProActive && !state.isPlusActive;
    if (!noPlan) return;
    recoveryAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/sync", { method: "GET", credentials: "include" });
        if (!cancelled && res.ok) void refetch();
      } catch {
        if (!cancelled) recoveryAttemptedRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, state, refetch, planCards]);

  const syncFromStripe = useCallback(async () => {
    setActionError(null);
    setSyncingFromStripe(true);
    try {
      const res = await fetch("/api/billing/sync", { method: "GET", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        await refetch();
      } else if (!res.ok && data?.reason) {
        setActionError(data.reason === "no_matching_subscription" ? "Ingen matchande prenumeration hittades." : data.reason);
      }
    } catch {
      setActionError("Kunde inte synka. Försök igen.");
    } finally {
      setSyncingFromStripe(false);
    }
  }, [refetch]);

  const isPastDue = state?.status === "past_due";
  const showNoPlan = !loading && state && !state.plan && !state.isProActive && !state.isPlusActive;

  const periodEndLabel = useMemo(() => {
    if (!state?.currentPeriodEnd) return null;
    const date = new Date(state.currentPeriodEnd);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US");
  }, [state?.currentPeriodEnd]);

  const plusEndsAtLabel = useMemo(() => {
    if (!state?.plusPeriodEnd) return null;
    const date = new Date(state.plusPeriodEnd);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US");
  }, [state?.plusPeriodEnd]);

  const startCheckout = async (plan: BillingPlan) => {
    setActionError(null);
    setPendingPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.url !== "string" || body.url.length === 0) {
        setActionError(resolveErrorMessage(body?.error));
        return;
      }

      window.location.assign(body.url);
    } catch {
      setActionError(resolveErrorMessage(null));
    } finally {
      setPendingPlan(null);
    }
  };

  const openPortal = async () => {
    setActionError(null);
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.url !== "string" || body.url.length === 0) {
        setActionError(resolveErrorMessage(body?.error));
        return;
      }
      window.location.assign(body.url);
    } catch {
      setActionError(resolveErrorMessage(null));
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {processingCheckout && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-200">
          Payment is being processed. Please wait while we confirm your subscription...
        </div>
      )}

      {isPastDue && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200">
          {pastDueMessage}
        </div>
      )}

      <div className="mb-6 rounded-lg border p-4">
        {/* Same DOM structure before/after mount so server and client match at hydration (no div vs p mismatch). */}
        {!mounted ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Current plan:</span> —
            </p>
            <p>
              <span className="font-medium">Status:</span> —
            </p>
          </div>
        ) : loading && !state ? (
          <p className="text-sm text-muted-foreground">Loading subscription status...</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Current plan:</span> {formatPlan(state?.plan ?? null)}
            </p>
            <p>
              <span className="font-medium">Status:</span> {formatStatus(state?.status ?? null)}
            </p>
            {periodEndLabel && (
              <p>
                <span className="font-medium">Period end:</span> {periodEndLabel}
              </p>
            )}
            {state?.cancelAtPeriodEnd && (
              <p className="text-amber-700 dark:text-amber-300">
                Subscription will end at the end of the billing period.
              </p>
            )}
          </div>
        )}
      </div>

      {(error || actionError) && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200">
          {actionError ?? error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {planCards.map((plan) => {
          const isActive =
            plan.id === "plus" ? state?.isPlusActive : state?.isProActive;
          const isCurrentPlan = state?.plan === plan.id && Boolean(isActive);
          const isPlusCancelledButActive =
            plan.id === "plus" && Boolean(state?.plusCancelAtPeriodEnd);
          const disabled =
            pendingPlan !== null || openingPortal || isCurrentPlan || isPlusCancelledButActive;
          return (
            <div key={plan.id} className="rounded-lg border p-5">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {isPlusCancelledButActive && plusEndsAtLabel && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  Cancelled but active until {plusEndsAtLabel}.
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {plan.bullets.map((bullet) => (
                  <li key={bullet}>- {bullet}</li>
                ))}
              </ul>
              {isPlusCancelledButActive ? (
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  disabled={openingPortal || pendingPlan !== null}
                  className="mt-5 w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {openingPortal ? "Opening portal..." : "Manage subscription"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCheckout(plan.id)}
                  disabled={disabled}
                  className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {isCurrentPlan
                    ? "Active plan"
                    : pendingPlan === plan.id
                      ? "Opening checkout..."
                      : plan.id === "plus"
                        ? "Start Plus"
                        : "Start Pro"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {showNoPlan && (
          <button
            type="button"
            onClick={() => void syncFromStripe()}
            disabled={syncingFromStripe}
            className="rounded-md border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {syncingFromStripe ? "Synkar..." : "Synka prenumeration från Stripe"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={openingPortal || pendingPlan !== null}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {openingPortal ? "Opening portal..." : "Manage subscription"}
        </button>
      </div>
    </div>
  );
}
