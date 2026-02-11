"use client";

import { useCallback, useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import { API_ROUTES } from "@/lib/api-routes";

type Payload = { url?: string; error?: string };

export function useDonationCheckout() {
  const [loading, setLoading] = useState(false);

  const startCheckout = useCallback(
    async (amountMinor: number, currency: string = "sek") => {
      setLoading(true);
      try {
        const res = await fetch(API_ROUTES.donationsCheckout, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountMinor, currency }),
        });

        const body = (await res.json().catch(() => ({}))) as Payload;

        if (!res.ok) {
          return {
            ok: false as const,
            error: resolveErrorMessage(body.error),
          };
        }

        const url = typeof body.url === "string" ? body.url : null;
        if (url) {
          window.location.href = url;
          return { ok: true as const, redirect: true };
        }
        return {
          ok: false as const,
          error: resolveErrorMessage(null),
        };
      } catch {
        return {
          ok: false as const,
          error: resolveErrorMessage(null),
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { startCheckout, loading };
}
