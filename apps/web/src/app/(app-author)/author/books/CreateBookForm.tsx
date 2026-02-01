"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";

export default function CreateBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [originalUrl, setOriginalUrl] = useState("");
  const [isTranslation, setIsTranslation] = useState(false);
  const [originalBookId, setOriginalBookId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled",
          description: description.trim() || undefined,
          language,
          original_url: originalUrl.trim() || undefined,
          is_translation: isTranslation,
          original_book_id: isTranslation && originalBookId.trim() ? originalBookId.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to create book");
        setLoading(false);
        return;
      }
      router.push(`/author/books/${data.id}`);
    } catch (err) {
      alert("Failed to create book");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-white/60">
        Verkli focuses on translations and non-English editions. English is available; we recommend publishing in your target language.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="create-title" className="text-xs font-medium text-slate-500 dark:text-white/50">Title</label>
          <input
            id="create-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book title"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="create-description" className="text-xs font-medium text-slate-500 dark:text-white/50">Description (optional)</label>
          <input
            id="create-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="create-language" className="text-xs font-medium text-slate-500 dark:text-white/50">Language</label>
          <select
            id="create-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="create-original-url" className="text-xs font-medium text-slate-500 dark:text-white/50">Original available on Amazon (optional)</label>
          <input
            id="create-original-url"
            type="url"
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            placeholder="https://..."
            className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-white/50">
            <input
              type="checkbox"
              checked={isTranslation}
              onChange={(e) => setIsTranslation(e.target.checked)}
              className="rounded border-slate-300 dark:border-white/30"
            />
            This is a translation
          </label>
          {isTranslation && (
            <div className="flex flex-col gap-1">
              <label htmlFor="create-original-book-id" className="text-xs font-medium text-slate-500 dark:text-white/50">Original book id (UUID)</label>
              <input
                id="create-original-book-id"
                type="text"
                value={originalBookId}
                onChange={(e) => setOriginalBookId(e.target.value)}
                placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
              />
            </div>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
      >
        {loading ? "Creating..." : "Create book"}
      </button>
    </form>
  );
}
