"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  actor_id: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
};

export function useUnreadCount() {
  const isVisible = useDocumentVisible();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCount = useCallback(async () => {
    if (inFlightRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/notifications/unread-count", {
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        setCount(json.count ?? 0);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // silent
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchCount, isVisible]);

  return { count, loading, refetch: fetchCount };
}

export function useNotificationList(page: number) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchList = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notifications?page=${page}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (controller.signal.aborted) return;
      setNotifications(json.notifications ?? []);
      setTotal(json.total ?? 0);
    } catch {
      if (!controller.signal.aborted) {
        setError("Could not load notifications. Check your connection and try again.");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [page]);

  useEffect(() => {
    void fetchList();
    return () => { abortRef.current?.abort(); };
  }, [fetchList]);

  return { notifications, total, loading, error, refetch: fetchList };
}
