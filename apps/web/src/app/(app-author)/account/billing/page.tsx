"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useBillingState } from "@/hooks/useBillingState";
import type { BillingPlan } from "@/lib/billing/plans";

type PlanCard = {
  id: BillingPlan;
  name: string;
  description: string;
  bullets: string[];
};

const PLAN_CARDS: PlanCard[] = [
  {
    id: "plus",
    name: "Verkli Plus",
    description: "För författare som vill publicera mer konsekvent.",
    bullets: [
      "Prioriterad support",
      "Snabbare arbetsflöde för publicering",
      "Tillgång till Plus-funktioner i appen",
    ],
  },
  {
    id: "pro",
    name: "Verkli Pro",
    description: "För AI-tunga arbetsflöden som kräver full kapacitet.",
    bullets: [
      "AI-översättning i editorn",
      "Ljudboksgenerering",
      "Text-till-video och andra Pro-funktioner",
    ],
  },
];

function formatPlan(plan: BillingPlan | null): string {
  if (plan === "plus") return "Verkli Plus";
  if (plan === "pro") return "Verkli Pro";
  return "Ingen aktiv plan";
}

function formatStatus(status: string | null): string {
  if (!status) return "Ingen";
  if (status === "trialing") return "Trial";
  if (status === "active") return "Aktiv";
  if (status === "past_due") return "Förfallen";
  if (status === "canceled") return "Avslutad";
  return status;
}

export default function BillingPage() {
  const { state, loading, error, refetch } = useBillingState();
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const isCheckoutReturn = searchParams.get("checkout") === "success";
  const [processingCheckout, setProcessingCheckout] = useState(isCheckoutReturn);
  const pollCount = useRef(0);

  const clearCheckoutParam = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!processingCheckout) return;

    const interval = setInterval(async () => {
      pollCount.current += 1;
      await refetch();
      if (pollCount.current >= 15) {
        setProcessingCheckout(false);
        clearCheckoutParam();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [processingCheckout, refetch, clearCheckoutParam]);

  useEffect(() => {
    if (processingCheckout && state?.isPlusActive) {
      setProcessingCheckout(false);
      clearCheckoutParam();
    }
  }, [processingCheckout, state?.isPlusActive, clearCheckoutParam]);

  const isPastDue = state?.status === "past_due";

  const periodEndLabel = useMemo(() => {
    if (!state?.currentPeriodEnd) return null;
    const date = new Date(state.currentPeriodEnd);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("sv-SE");
  }, [state?.currentPeriodEnd]);

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
        <h1 className="text-2xl font-semibold">Abonnemang</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hantera Verkli Plus och Verkli Pro.
        </p>
      </div>

      {processingCheckout && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-200">
          Betalningen behandlas. Vänta medan vi bekräftar ditt abonnemang…
        </div>
      )}

      {isPastDue && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200">
          Din betalning är försenad. Uppdatera abonnemanget för att återaktivera Pro-funktioner.
        </div>
      )}

      <div className="mb-6 rounded-lg border p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar abonnemangsstatus…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Nuvarande plan:</span> {formatPlan(state?.plan ?? null)}
            </p>
            <p>
              <span className="font-medium">Status:</span> {formatStatus(state?.status ?? null)}
            </p>
            {periodEndLabel && (
              <p>
                <span className="font-medium">Periodslut:</span> {periodEndLabel}
              </p>
            )}
            {state?.cancelAtPeriodEnd && (
              <p className="text-amber-700 dark:text-amber-300">
                Abonnemanget avslutas vid periodens slut.
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
        {PLAN_CARDS.map((plan) => {
          const isCurrentPlan = state?.plan === plan.id && Boolean(state?.isPlusActive);
          const disabled = pendingPlan !== null || openingPortal || isCurrentPlan;
          return (
            <div key={plan.id} className="rounded-lg border p-5">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {plan.bullets.map((bullet) => (
                  <li key={bullet}>- {bullet}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void startCheckout(plan.id)}
                disabled={disabled}
                className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isCurrentPlan
                  ? "Aktiv plan"
                  : pendingPlan === plan.id
                    ? "Öppnar kassan…"
                    : plan.id === "plus"
                      ? "Starta Plus"
                      : "Starta Pro"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={openingPortal || pendingPlan !== null}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {openingPortal ? "Öppnar portal…" : "Hantera abonnemang"}
        </button>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          Uppdatera status
        </button>
      </div>
    </div>
  );
}
