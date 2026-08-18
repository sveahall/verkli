"use client";

import { useId, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  SUPPORT_EMAIL_MAX,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TOPICS,
  submitSupportRequest,
  type SupportTopic,
} from "./supportRequest";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function SupportContactForm() {
  const fieldId = useId();
  const pathname = usePathname();
  const [topic, setTopic] = useState<SupportTopic>("bug");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const submitting = state.kind === "submitting";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setState({ kind: "submitting" });

    const result = await submitSupportRequest({
      topic,
      message,
      replyEmail,
      pageUrl: pathname ?? undefined,
    });

    if (result.ok) {
      setMessage("");
      setState({ kind: "success" });
      return;
    }
    setState({ kind: "error", message: result.message });
  }

  if (state.kind === "success") {
    return (
      <div
        role="status"
        className="card-base p-6 sm:p-8"
        data-testid="support-success"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            aria-hidden
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-success)]"
          />
          <div>
            <h3 className="text-section-title">Message sent</h3>
            <p className="text-body mt-2">
              Thank you — your message is with our team. We aim to reply within
              two business days.{" "}
              {replyEmail.trim()
                ? `We will reply to ${replyEmail.trim()}.`
                : "If you are signed in, we will reply to the address on your account."}
            </p>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="btn-secondary mt-5"
            >
              Send another message
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-base space-y-5 p-6 sm:p-8">
      {state.kind === "error" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-[var(--color-error-muted)] px-4 py-3"
          data-testid="support-error"
        >
          <AlertCircle
            aria-hidden
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-error)]"
          />
          <p className="text-[15px] leading-relaxed text-[var(--color-error)]">
            {state.message}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor={`${fieldId}-topic`} className="text-label block">
          What is this about?
        </label>
        <select
          id={`${fieldId}-topic`}
          value={topic}
          onChange={(event) => setTopic(event.target.value as SupportTopic)}
          className="input-base"
        >
          {SUPPORT_TOPICS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${fieldId}-message`} className="text-label block">
          How can we help?
        </label>
        <textarea
          id={`${fieldId}-message`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          rows={6}
          maxLength={SUPPORT_MESSAGE_MAX}
          placeholder="Tell us what happened. If it involves a book or a purchase, include the title and the date — it gets us to an answer faster."
          className="input-base resize-y"
        />
        <p className="text-helper tabular-nums">
          {message.length} / {SUPPORT_MESSAGE_MAX}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${fieldId}-email`} className="text-label block">
          Your email <span className="font-normal">(optional)</span>
        </label>
        <input
          id={`${fieldId}-email`}
          type="email"
          value={replyEmail}
          onChange={(event) => setReplyEmail(event.target.value)}
          maxLength={SUPPORT_EMAIL_MAX}
          autoComplete="email"
          placeholder="you@example.com"
          className="input-base"
        />
        <p className="text-helper">
          Add this if you are not signed in, so we have somewhere to send the
          answer.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting || !message.trim()}
        className="btn-primary w-full sm:w-auto"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
