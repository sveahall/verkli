"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";

type Payload = { balance?: number; error?: string };

export function useCreditsBalance(options?: { pollIntervalMs?: number }) {
  const pollIntervalMs = options?.pollIntervalMs ?? 0;
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const body = (await res.json().catch(() => ({}))) as Payload;

      if (!res.ok) {
        if (res.status === 401) {
          setBalance(null);
          setError(null);
          return;
        }
        setError(resolveErrorMessage(body.error));
        setBalance(null);
        return;
      }

      setBalance(typeof body.balance === "number" ? body.balance : 0);
      setError(null);
    } catch {
      setError(resolveErrorMessage(null));
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs < 1000) return;
    const interval = setInterval(() => void fetchBalance(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchBalance, pollIntervalMs]);

  return {
    balance: balance ?? 0,
    loading,
    error,
    refetch: fetchBalance,
  };
}
