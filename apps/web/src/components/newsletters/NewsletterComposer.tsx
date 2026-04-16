"use client";

import { useCallback, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { resolveErrorMessage } from "@/lib/error-messages";

type NewsletterData = {
  id: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: string;
};

type NewsletterComposerProps = {
  newsletter: NewsletterData;
  onSaved?: () => void;
  onSent?: () => void;
};

export default function NewsletterComposer({
  newsletter,
  onSaved,
  onSent,
}: NewsletterComposerProps) {
  const [subject, setSubject] = useState(newsletter.subject);
  const [bodyHtml, setBodyHtml] = useState(newsletter.body_html);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDraft = newsletter.status === "draft";

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(bodyHtml), [bodyHtml]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/newsletters/${newsletter.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          bodyHtml,
          bodyText: bodyHtml.replace(/<[^>]*>/g, ""),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      setSuccess("Draft saved");
      onSaved?.();
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setSaving(false);
    }
  }, [newsletter.id, subject, bodyHtml, onSaved]);

  const handleSend = useCallback(async () => {
    if (!confirm("Are you sure you want to send this newsletter? This cannot be undone.")) {
      return;
    }

    // Save first
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      // Save draft first
      await fetch(`/api/newsletters/${newsletter.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          bodyHtml,
          bodyText: bodyHtml.replace(/<[^>]*>/g, ""),
        }),
      });

      // Then send
      const res = await fetch(`/api/newsletters/${newsletter.id}/send`, {
        method: "POST",
        credentials: "include",
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipientCount?: number;
      };

      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      setSuccess(`Newsletter sent to ${body.recipientCount ?? 0} subscribers`);
      onSent?.();
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setSending(false);
    }
  }, [newsletter.id, subject, bodyHtml, onSent]);

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-[13px] text-green-600 dark:text-green-400">{success}</p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="nl-subject"
          className="text-[13px] font-medium text-slate-700 dark:text-white/70"
        >
          Subject
        </label>
        <input
          id="nl-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!isDraft}
          placeholder="Subject line for the newsletter..."
          className="min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-4 text-[14px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-medium text-slate-700 dark:text-white/70">
            Content (HTML)
          </label>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-[12px] font-medium text-[#907AFF] hover:text-[#7A66E0]"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
        </div>

        {showPreview ? (
          <div
            className="min-h-[300px] rounded-xl border border-slate-200/80 bg-white p-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            disabled={!isDraft}
            rows={15}
            placeholder="<h1>Hello!</h1><p>Here's the latest news...</p>"
            className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 font-mono text-[13px] text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:ring-offset-[#0b0b12]"
          />
        )}
      </div>

      {isDraft && (
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleSave}
            isLoading={saving}
            loadingText="Saving..."
            disabled={!subject.trim()}
          >
            Save draft
          </Button>
          <Button
            onClick={handleSend}
            isLoading={sending}
            loadingText="Sending..."
            disabled={!subject.trim()}
          >
            Send newsletter
          </Button>
        </div>
      )}

      {!isDraft && (
        <p className="text-[13px] text-slate-500 dark:text-white/50">
          This newsletter has already been sent and cannot be edited.
        </p>
      )}
    </div>
  );
}
