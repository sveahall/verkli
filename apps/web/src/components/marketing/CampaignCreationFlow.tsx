"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Campaign } from "@/lib/marketing/types";

type BookOption = { id: string; title: string };

const PLATFORM_OPTIONS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "email", label: "Email" },
];

const CONTENT_TYPES = [
  { id: "caption", label: "Caption" },
  { id: "hook", label: "Hook" },
  { id: "blurb", label: "Blurb" },
];

type Props = {
  books: BookOption[];
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
};

export default function CampaignCreationFlow({ books, onClose, onCreated }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [selectedBookId, setSelectedBookId] = useState(books[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [contentType, setContentType] = useState("caption");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Enter a campaign name.");
      return;
    }
    if (!selectedBookId) {
      setError("Choose a book.");
      return;
    }
    if (platforms.length === 0) {
      setError("Choose at least one platform.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const channel = platforms[0];
      const res = await fetch(`/api/books/${selectedBookId}/marketing/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contentType }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not create campaign.");
        return;
      }

      const data = await res.json();
      const campaign: Campaign = {
        id: data.id ?? `cmp-${Date.now()}`,
        name: name.trim(),
        objective: data.headline ?? "",
        status: "draft",
        updatedAt: new Date().toISOString(),
        channels: platforms,
      };

      onCreated(campaign);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-foreground">Create campaign</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="campaign-name" className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Campaign name
            </label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring launch 2026"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-[#907AFF]/60 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/30"
            />
          </div>

          <div>
            <label htmlFor="campaign-book" className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Book
            </label>
            <select
              id="campaign-book"
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-[#907AFF]/60 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/30"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
              {books.length === 0 && <option value="">No books</option>}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium text-muted-foreground">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => {
                const active = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${
                      active
                        ? "bg-[#907AFF] text-white"
                        : "border border-border bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="campaign-content-type" className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Content type
            </label>
            <select
              id="campaign-content-type"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-[#907AFF]/60 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/30"
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-[#907AFF] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
