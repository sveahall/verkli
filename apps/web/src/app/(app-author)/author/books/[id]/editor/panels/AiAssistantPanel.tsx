"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InlineAiAction } from "@/features/book-workspace/types";

/**
 * Author writing assistant.
 *
 * Talks to POST /api/books/[id]/ai/chat, which runs Anthropic (primary) with
 * NVIDIA NIM as fallback and deterministic templates as a last resort. The
 * reply carries a `source` field, and this panel renders it: an author must be
 * able to tell a real model answer from a canned one.
 */

export type PendingAiRequest = {
  /** Changes on every dispatch so a repeated action still re-triggers. */
  id: string;
  action: InlineAiAction;
  selectedText: string;
};

export type AiAssistantPanelProps = {
  bookId: string;
  chapterId: string | null;
  /** Set when the author triggered an action from the editor's bubble menu. */
  pendingRequest?: PendingAiRequest | null;
  onPendingRequestHandled?: () => void;
  /**
   * "dock" is the Cursor-shaped placement: a full-height column beside the
   * manuscript, so asking a question no longer means leaving the page you were
   * writing on. "page" is the original standalone view, kept for any route that
   * still renders the assistant on its own.
   */
  variant?: "page" | "dock";
  onClose?: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "llm" | "template";
  provider?: string;
};

type ChatResponse = {
  content?: string;
  source?: "llm" | "template";
  provider?: string;
};

/** Bubble-menu actions the panel can serve. Audio and translate route elsewhere. */
const ACTION_PROMPTS: Partial<Record<InlineAiAction, string>> = {
  rewrite: "Rewrite this passage. Keep the meaning, sharpen the prose.",
  pacing: "Improve the pacing of this passage.",
  expand: "Expand this passage with more detail and depth.",
};

/**
 * The server's prompt builder slices the selection to 2000 characters and the
 * route rejects anything over 4000. Capping here keeps all three in agreement:
 * what the author selected is what the model reads, and an oversized selection
 * is trimmed visibly instead of being silently dropped or 400'd.
 */
const MAX_SELECTION_CHARS = 2000;

const QUICK_PROMPTS = [
  "How can I make this chapter open stronger?",
  "Where does the pacing sag?",
  "Give me three alternative titles for this book.",
] as const;

export default function AiAssistantPanel({
  bookId,
  chapterId,
  variant = "page",
  onClose,
  pendingRequest,
  onPendingRequestHandled,
}: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(
    async (message: string, selectedText: string | null) => {
      const trimmed = message.trim();
      if (!trimmed || sending) return;

      const selection = selectedText?.slice(0, MAX_SELECTION_CHARS) ?? null;
      const wasTruncated =
        selectedText != null && selectedText.length > MAX_SELECTION_CHARS;

      setSending(true);
      setError(
        wasTruncated
          ? `Only the first ${MAX_SELECTION_CHARS.toLocaleString("en-US")} characters of the selection were sent.`
          : null
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: selection ? `${trimmed}\n\n"${selection}"` : trimmed,
        },
      ]);

      try {
        const res = await fetch(`/api/books/${bookId}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            chapterId,
            selectedText: selection,
          }),
        });

        if (!res.ok) {
          setError(
            res.status === 429
              ? "Too many requests in a row. Wait a moment and try again."
              : res.status === 400
                ? "That message could not be sent. Shorten it and try again."
                : "The assistant could not be reached. Try again."
          );
          return;
        }

        const json = (await res.json().catch(() => null)) as ChatResponse | null;
        const content = json?.content?.trim();
        if (!content) {
          setError("The assistant returned an empty reply. Try again.");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            source: json?.source,
            provider: json?.provider,
          },
        ]);
      } catch {
        setError("The assistant could not be reached. Try again.");
      } finally {
        setSending(false);
      }
    },
    [bookId, chapterId, sending]
  );

  // Bubble-menu handoff. The editor and this panel are different tools, so the
  // action arrives as a prop after navigation rather than as a direct call.
  const handledRequestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingRequest) return;
    if (handledRequestIdRef.current === pendingRequest.id) return;
    handledRequestIdRef.current = pendingRequest.id;

    const prompt = ACTION_PROMPTS[pendingRequest.action];
    if (!prompt) return;
    send(prompt, pendingRequest.selectedText);
    onPendingRequestHandled?.();
  }, [pendingRequest, send, onPendingRequestHandled]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const handleSubmit = () => {
    // `send` bails out while a request is in flight. Clearing the composer
    // before that guard would discard whatever the author typed meanwhile.
    if (sending || input.trim().length === 0) return;
    const value = input;
    setInput("");
    send(value, null);
  };

  const isDock = variant === "dock";

  return (
    <div
      className={
        // flex-1 + min-h-0, not h-full: the dock's parent is a flex column
        // with a definite height, and only this pair both fills that height and
        // lets the transcript scroll instead of pushing the composer off-screen.
        isDock ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl space-y-6"
      }
    >
      {isDock ? null : (
        <div>
          <h2 className="text-[clamp(20px,2.5vw,24px)] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            AI Assistant
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
            Ask about craft, pacing, or dialogue. Select text in the editor first
            for targeted suggestions.
          </p>
        </div>
      )}

      <div
        className={
          isDock
            ? "flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-surface-md dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none"
            : "rounded-2xl border border-black/[0.05] bg-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none"
        }
      >
        {isDock ? (
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/80 px-4 py-3 dark:border-white/10">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI Assistant
              </h2>
              <p className="mt-0.5 text-[13px] leading-snug text-slate-500 dark:text-white/45">
                Select text in the editor for targeted suggestions.
              </p>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI assistant"
                className="-mr-2 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          className={
            isDock
              ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
              : "max-h-[420px] min-h-[220px] space-y-4 overflow-y-auto p-5"
          }
        >
          {messages.length === 0 && !sending && (
            <div className={isDock ? "space-y-2.5 py-2" : "space-y-3 py-6 text-center"}>
              <p className="text-sm text-slate-500 dark:text-white/50">
                Nothing asked yet. Try one of these:
              </p>
              <div className={isDock ? "flex flex-col gap-2" : "flex flex-wrap justify-center gap-2"}>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt, null)}
                    className={
                      isDock
                        ? "w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-left text-[13px] leading-snug text-slate-600 transition-colors hover:border-[#907AFF]/40 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:text-white"
                        : "rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-[13px] text-slate-600 transition-colors hover:border-[#907AFF]/40 hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:text-white"
                    }
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#907AFF] px-4 py-3 text-[15px] leading-relaxed text-white"
                  : "mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-[15px] leading-relaxed text-slate-800 dark:bg-white/[0.06] dark:text-white/90"
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && message.source === "template" && (
                <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-white/50">
                  Canned reply — the AI model was unavailable.
                </p>
              )}
            </div>
          ))}

          {sending && (
            <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-white/[0.06]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#907AFF]" />
              <span className="text-sm text-slate-500 dark:text-white/50">
                Thinking…
              </span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        <div className={`shrink-0 border-t border-black/[0.05] dark:border-white/[0.06] ${isDock ? "p-4" : "p-5"}`}>
          {error && (
            <p
              role="alert"
              className="mb-3 text-[13px] text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask the assistant about your manuscript…"
            aria-label="Message to the AI assistant"
            className={isDock ? "min-h-[64px]" : "min-h-[88px]"}
            maxLength={2000}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] text-slate-500 dark:text-white/50">
              ⌘ + Enter to send
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={sending || input.trim().length === 0}
              isLoading={sending}
              loadingText="Sending"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
