"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TranslationStatusBadge, { type TranslationStatus } from "./TranslationStatusBadge";

type VersionEntry = {
  id: string;
  languageCode: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
};

type PendingEntry = {
  id: string;
  languageCode: string;
  status: string;
  createdAt: string;
};

function mapStatus(raw: string): TranslationStatus {
  if (raw === "done") return "completed";
  if (raw === "translating") return "translating";
  if (raw === "failed") return "failed";
  return "pending";
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  sv: "Svenska",
  es: "Espa\u00f1ol",
  fr: "Fran\u00e7ais",
  de: "Deutsch",
  it: "Italiano",
  pt: "Portugu\u00eas",
  nl: "Nederlands",
  no: "Norsk",
  da: "Dansk",
  fi: "Suomi",
  pl: "Polski",
};

export default function LanguageVersionList({ bookId }: { bookId: string }) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/translations`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions ?? []);
      setPending(data.pendingTranslations ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-white/5" />
        ))}
      </div>
    );
  }

  const allEntries = [
    ...versions.map((v) => ({ ...v, isPending: false })),
    ...pending.map((p) => ({ ...p, publishedAt: null, isPending: true })),
  ];

  if (allEntries.length === 0) {
    return (
      <p className="text-[13px] text-slate-500 dark:text-white/50">
        Inga \u00f6vers\u00e4ttningar \u00e4nnu.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {allEntries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-slate-800 dark:text-white/80">
              {LANGUAGE_NAMES[entry.languageCode] ?? entry.languageCode}
            </span>
            <TranslationStatusBadge status={mapStatus(entry.status)} />
          </div>
          {!entry.isPending && (
            <Link
              href={`/author/books/${bookId}?lang=${entry.languageCode}`}
              className="text-[12px] font-medium text-[#907AFF] transition hover:text-[#7058DD]"
            >
              \u00d6ppna
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
