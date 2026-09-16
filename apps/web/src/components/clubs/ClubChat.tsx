"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

type ChatMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ClubChatProps = {
  clubId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
};

export default function ClubChat({
  clubId,
  initialMessages,
  currentUserId,
}: ClubChatProps) {
  const isVisible = useDocumentVisible();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    // Only auto-scroll if the user is already near the bottom of the chat.
    // Otherwise they're reading backlog and a new message jerking the view
    // to the bottom would be infuriating.
    const anchor = bottomRef.current;
    if (!anchor) return;
    const scroller =
      anchor.closest('[data-club-chat-scroll="true"]') ?? document.scrollingElement ?? document.documentElement;
    if (!(scroller instanceof HTMLElement)) {
      scrollToBottom();
      return;
    }
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom < 200) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  const fetchMessages = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await fetch(`/api/book-clubs/${clubId}/messages`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Could not load club messages");
      const body = (await res.json()) as { messages: ChatMessage[] };
      if (controller.signal.aborted) return;
      setMessages(body.messages);
      setLoadError(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (!controller.signal.aborted) setLoadError(true);
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
      }
    }
  }, [clubId]);

  useEffect(() => {
    if (!isVisible) return;
    void fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, [fetchMessages, isVisible]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if (!content || sending) return;

      setSending(true);
      setError(null);

      try {
        const res = await fetch(`/api/book-clubs/${clubId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: ChatMessage;
        };

        if (!res.ok) {
          setError(resolveErrorMessage(body.error));
          return;
        }

        if (body.message) {
          setMessages((prev) => prev.some((message) => message.id === body.message!.id) ? prev : [...prev, body.message as ChatMessage]);
        }
        setDraft("");
      } catch {
        setError(resolveErrorMessage(null));
      } finally {
        setSending(false);
      }
    },
    [clubId, draft, sending]
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div data-club-chat-scroll="true" role="log" aria-label="Club conversation" aria-live="polite" aria-relevant="additions" tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-ring flex max-h-[400px] flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.user_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-[14px] ${
                  isOwn
                    ? "bg-foreground text-white dark:text-background"
                    : "bg-muted text-foreground dark:bg-card "
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    isOwn
                      ? "text-white/60 dark:text-muted-foreground"
                      : "text-muted-foreground "
                  }`}
                >
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {loadError && (
        <div className="px-4 py-3">
          <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">Could not update messages. The conversation may be out of date.</p>
          <Button variant="secondary" size="sm" onClick={fetchMessages}>Try again</Button>
        </div>
      )}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          type="text"
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message..."
          maxLength={2000}
          className="min-h-[44px] min-w-0 flex-1 rounded-full border border-border bg-card/90 px-4 text-[14px] text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-card dark:focus-visible:ring-offset-background"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!draft.trim() || sending}
          isLoading={sending}
          loadingText="..."
        >
          Send
        </Button>
      </form>
      {error && (
        <p role="alert" className="px-4 pb-3 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
