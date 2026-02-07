"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { getLanguageLabel, normalizeLanguageOrNull } from "@/lib/languages";

export type LanguageVersion = {
  id: string;
  language_code: string | null;
  published_at?: string | null;
};

type Props = {
  bookId: string;
  versions: LanguageVersion[];
  activeLanguage: string;
  originalLanguage?: string | null;
};

export default function LanguageTabs({ bookId, versions, activeLanguage, originalLanguage }: Props) {
  const router = useRouter();

  const items = useMemo<TabItem[]>(() => {
    return versions.map((version) => {
      const langKey = normalizeLanguageOrNull(version.language_code) ?? "unknown";
      const isOriginal = normalizeLanguageOrNull(originalLanguage) === langKey;
      return {
        id: langKey,
        label: isOriginal ? "Original" : getLanguageLabel(langKey),
        badge: version.published_at ? "Published" : "Draft",
      };
    });
  }, [versions, originalLanguage]);

  if (items.length <= 1) return null;

  return (
    <Tabs
      items={items}
      active={activeLanguage}
      onChange={(id) => router.push(`/reader/books/${bookId}?lang=${id}`)}
    />
  );
}
