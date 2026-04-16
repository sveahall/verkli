"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { resolveErrorMessage } from "@/lib/error-messages";

type PollCreatorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId?: string;
  onCreated: () => void;
};

export default function PollCreator({
  open,
  onOpenChange,
  bookId,
  onCreated,
}: PollCreatorProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setQuestion("");
    setOptions(["", ""]);
    setClosesAt("");
    setError(null);
  }, []);

  const addOption = useCallback(() => {
    if (options.length < 10) {
      setOptions((prev) => [...prev, ""]);
    }
  }, [options.length]);

  const removeOption = useCallback(
    (index: number) => {
      if (options.length <= 2) return;
      setOptions((prev) => prev.filter((_, i) => i !== index));
    },
    [options.length]
  );

  const updateOption = useCallback((index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      const trimmedOptions = options
        .map((o) => o.trim())
        .filter((o) => o.length > 0);

      if (trimmedOptions.length < 2) {
        setError("At least two answer options are required.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/polls", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: question.trim(),
            options: trimmedOptions,
            book_id: bookId || undefined,
            closes_at: closesAt || undefined,
          }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!res.ok) {
          setError(resolveErrorMessage(body.error));
          return;
        }

        reset();
        onOpenChange(false);
        onCreated();
      } catch {
        setError(resolveErrorMessage(null));
      } finally {
        setLoading(false);
      }
    },
    [question, options, closesAt, bookId, reset, onOpenChange, onCreated]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create poll</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && (
            <p className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="poll-question"
              className="text-[13px] font-medium text-slate-700 dark:text-white/70"
            >
              Question
            </label>
            <input
              id="poll-question"
              type="text"
              required
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Which book should we read next?"
              className="min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-slate-700 dark:text-white/70">
              Answer options
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={200}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="min-h-[40px] flex-1 rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-white/40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    aria-label="Remove option"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                type="button"
                onClick={addOption}
                className="text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
              >
                + Add option
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="poll-closes"
              className="text-[13px] font-medium text-slate-700 dark:text-white/70"
            >
              Closes (optional)
            </label>
            <input
              id="poll-closes"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={loading}
            loadingText="Creating..."
            disabled={!question.trim()}
          >
            Create poll
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
