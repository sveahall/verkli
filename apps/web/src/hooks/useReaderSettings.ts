"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ReaderSettingsData = {
  font_family: string;
  font_size: number;
  theme: string;
  line_height: number;
  content_width: string;
};

const DEFAULTS: ReaderSettingsData = {
  font_family: "serif",
  font_size: 18,
  theme: "light",
  line_height: 1.7,
  content_width: "medium",
};

const LS_KEY = "verkli_reader_settings";

function loadFromLocalStorage(): ReaderSettingsData {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettingsData>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveToLocalStorage(settings: ReaderSettingsData) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    // silent
  }
}

export function useReaderSettings(isLoggedIn: boolean) {
  const [settings, setSettings] = useState<ReaderSettingsData>(() => loadFromLocalStorage());
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from API on mount if logged in
  const fetchSettings = useCallback(async () => {
    if (!isLoggedIn) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/reader/settings");
      if (res.ok) {
        const json = await res.json();
        if (json.settings) {
          const merged = { ...DEFAULTS, ...json.settings };
          setSettings(merged);
          saveToLocalStorage(merged);
        }
      }
    } catch {
      // fall back to localStorage
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    (partial: Partial<ReaderSettingsData>) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        saveToLocalStorage(next);

        // Debounced save to API
        if (isLoggedIn) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(async () => {
            try {
              await fetch("/api/reader/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(partial),
              });
            } catch {
              // silent
            }
          }, 500);
        }

        return next;
      });
    },
    [isLoggedIn]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { settings, updateSettings, isLoading };
}
