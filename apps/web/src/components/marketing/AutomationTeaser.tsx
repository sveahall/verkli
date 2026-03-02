"use client";

import { useCallback, useState } from "react";

type AutomationTeaserProps = {
  bookId: string | null;
  language?: string;
};

export default function AutomationTeaser({ bookId, language = "en" }: AutomationTeaserProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ jobId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/books/${bookId}/marketing/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, channels: ["generic", "tiktok", "instagram", "x"] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [bookId, language]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-background p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/15 via-transparent to-[#FCC997]/20 opacity-70" />
      <div className="relative z-10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#907AFF]/15 text-[#907AFF]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">Automation tools</p>
            <p className="text-[12px] text-muted-foreground">
              Generera kampanjinnehåll för alla kanaler med ett klick.
            </p>
          </div>
        </div>

        {result ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            Kampanj köad! Jobb-ID: <code className="text-xs">{result.jobId}</code>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Generera headline, caption, CTA och hashtags för Generic, TikTok, Instagram och X.
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !bookId}
          className="rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Genererar\u2026" : "Generera kampanj f\u00f6r alla kanaler"}
        </button>
      </div>
    </div>
  );
}
