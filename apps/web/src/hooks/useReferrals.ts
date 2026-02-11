"use client";

import { useCallback, useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import { API_ROUTES } from "@/lib/api-routes";

type GeneratePayload = { code?: string; error?: string };
type RedeemPayload = { success?: boolean; creditsAdded?: number; error?: string };

export function useReferrals() {
  const [generateLoading, setGenerateLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);

  const generateCode = useCallback(async () => {
    setGenerateLoading(true);
    try {
      const res = await fetch(API_ROUTES.referralsGenerate, {
        method: "POST",
        credentials: "include",
      });

      const body = (await res.json().catch(() => ({}))) as GeneratePayload;

      if (!res.ok) {
        return {
          ok: false as const,
          code: null as string | null,
          error: resolveErrorMessage(body.error),
        };
      }

      const code = typeof body.code === "string" ? body.code : null;
      return { ok: true as const, code, error: null };
    } catch {
      return {
        ok: false as const,
        code: null,
        error: resolveErrorMessage(null),
      };
    } finally {
      setGenerateLoading(false);
    }
  }, []);

  const redeemCode = useCallback(async (code: string) => {
    setRedeemLoading(true);
    try {
      const res = await fetch(API_ROUTES.referralsRedeem, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const body = (await res.json().catch(() => ({}))) as RedeemPayload;

      if (!res.ok) {
        return {
          ok: false as const,
          creditsAdded: 0,
          error: resolveErrorMessage(body.error),
        };
      }

      return {
        ok: true as const,
        creditsAdded: typeof body.creditsAdded === "number" ? body.creditsAdded : 0,
        error: null,
      };
    } catch {
      return {
        ok: false as const,
        creditsAdded: 0,
        error: resolveErrorMessage(null),
      };
    } finally {
      setRedeemLoading(false);
    }
  }, []);

  return {
    generateCode,
    redeemCode,
    generateLoading,
    redeemLoading,
  };
}
