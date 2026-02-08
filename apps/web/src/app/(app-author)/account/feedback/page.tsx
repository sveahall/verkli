"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { resolveErrorMessage } from "@/lib/error-messages";

type FeedbackItem = {
  id: string;
  type: string;
  message: string;
  url: string | null;
  status: string;
  created_at: string;
};

export default function AccountFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"bug" | "idea" | "other">("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/feedback", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { feedback: [] }))
      .then((data) => {
        setFeedback(data.feedback ?? []);
      })
      .catch(() => setFeedback([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(resolveErrorMessage(data.error));
        return;
      }
      setMessage("");
      setSent(true);
      const data = await res.json();
      setFeedback((prev) => [{ id: data.id, type, message, url: null, status: "new", created_at: data.created_at }, ...prev]);
    } catch {
      setError(resolveErrorMessage(null, "Kunde inte skicka. Försök igen."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <p className="mt-1 text-muted-foreground text-sm">Send a bug report or idea. We read everything.</p>

      <form onSubmit={handleSubmit} className="mt-6 rounded-lg border p-4">
        {error && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {sent && (
          <p className="mb-3 text-sm text-green-600 dark:text-green-400">Thanks! Your feedback was sent.</p>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="type" className="block text-sm font-medium">Type</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as "bug" | "idea" | "other")}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="bug">Bug</option>
              <option value="idea">Idea</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium">Message</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={2000}
              rows={4}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Describe the issue or idea..."
            />
            <p className="mt-1 text-xs text-muted-foreground">{message.length}/2000</p>
          </div>
          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </form>

      <h2 className="mt-8 text-lg font-medium">Your feedback</h2>
      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : feedback.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {feedback.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium capitalize">{item.type}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{item.status}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleDateString("sv-SE")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
