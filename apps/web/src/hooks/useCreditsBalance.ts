"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import { API_ROUTES } from "@/lib/api-routes";

type Payload = { balance?: number; error?: string };

export function useCreditsBalance(options?: { pollIntervalMs?: number }) {
  const pollIntervalMs = options?.pollIntervalMs ?? 0;
  const isVisible = useDocumentVisible();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBalance = useCallback(async () => {
    if (inFlightRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    try {
      // Fetch through canonical API path.
      const res = await fetch(API_ROUTES.creditsBalance, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
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
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setError(resolveErrorMessage(null));
      setBalance(null);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!isVisible) return;
    if (!pollIntervalMs || pollIntervalMs < 1000) return;
    const interval = setInterval(() => void fetchBalance(), pollIntervalMs);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchBalance, isVisible, pollIntervalMs]);

  return {
    balance: balance ?? 0,
    loading,
    error,
    refetch: fetchBalance,
  };
}
